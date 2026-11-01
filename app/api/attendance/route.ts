import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { SHIFT_OPTIONS, isShiftCode, type ShiftCode } from "@/lib/shifts";
import Attendance from "@/models/Attendance";
import WeeklyPay from "@/models/WeeklyPay";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const employeeName = (searchParams.get("employee") || "Thanh Phong").trim();
    const weekStart = searchParams.get("weekStart");
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: "Ngày bắt đầu tuần không hợp lệ" }, { status: 400 });
    }
    const weekEnd = new Date(`${weekStart}T12:00:00`);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const endString = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, "0")}-${String(weekEnd.getDate()).padStart(2, "0")}`;
    const [attendance, weeklyPay] = await Promise.all([
      Attendance.find({ employeeName, date: { $gte: weekStart, $lte: endString } }).sort({ date: 1 }).lean(),
      WeeklyPay.findOne({ employeeName, weekStart }).lean(),
    ]);
    return NextResponse.json({ attendance, hourlyRate: weeklyPay?.hourlyRate ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể kết nối cơ sở dữ liệu";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const body = await request.json();
    const employeeName = String(body.employeeName || "").trim();
    const date = String(body.date || "");
    const requestedShifts = Array.isArray(body.shifts) ? body.shifts : [];
    const coworkers = Array.isArray(body.coworkers)
      ? body.coworkers.map((name: unknown) => String(name).trim()).filter(Boolean)
      : [];
    if (!employeeName || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !requestedShifts.length) {
      return NextResponse.json({ error: "Vui lòng nhập tên, ngày làm và chọn ít nhất một ca" }, { status: 400 });
    }
    const codes = requestedShifts.map((shift: { code?: unknown }) => shift?.code);
    if (codes.some((code: unknown) => !isShiftCode(code)) || new Set(codes).size !== codes.length) {
      return NextResponse.json({ error: "Danh sách ca làm không hợp lệ" }, { status: 400 });
    }
    const shifts = (codes as ShiftCode[]).map((code) => {
      const option = SHIFT_OPTIONS.find((shift) => shift.code === code)!;
      return { code: option.code, start: option.start, end: option.end, hours: option.hours };
    });
    if (shifts.some((shift) => shift.code === "O") && shifts.length > 1) {
      return NextResponse.json({ error: "Ca nghỉ không thể chọn cùng ca làm khác" }, { status: 400 });
    }
    const totalHours = shifts.reduce((sum, shift) => sum + shift.hours, 0);
    if (!Number.isFinite(totalHours) || totalHours < 0 || totalHours > 14) {
      return NextResponse.json({ error: "Tổng giờ mỗi ngày không được vượt quá 14 tiếng" }, { status: 400 });
    }
    const saved = await Attendance.findOneAndUpdate(
      { employeeName, date },
      { employeeName, date, shifts, coworkers, totalHours },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    return NextResponse.json({ attendance: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể lưu ngày công";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await connectToDatabase();
    const body = await request.json();
    const employeeName = String(body.employeeName || "").trim();
    const date = String(body.date || "");
    await Attendance.deleteOne({ employeeName, date });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể xóa ngày công";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
