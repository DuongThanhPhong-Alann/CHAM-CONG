import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { SHIFT_OPTIONS, isShiftCode, type ShiftCode } from "@/lib/shifts";
import Attendance from "@/models/Attendance";
import WeeklyPay from "@/models/WeeklyPay";
import { authorizeTimesheet } from "@/lib/tenant";
import {
  deleteSupabaseAttendance,
  findSupabaseAttendance,
  findSupabaseWeeklyPay,
  readWithSupabaseFallback,
  upsertSupabaseAttendance,
  writeToBoth,
} from "@/lib/supabase-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await authorizeTimesheet(searchParams.get("timesheetId"));
    if (access.status !== 200) return NextResponse.json({ error: access.status === 401 ? "Vui lòng đăng nhập" : "Bảng chấm công không tồn tại" }, { status: access.status });
    const ownerId = String(access.account!._id);
    const timesheetId = String(access.timesheet!._id);
    const employeeName = (searchParams.get("employee") || "Thanh Phong").trim();
    const weekStart = searchParams.get("weekStart");
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: "Ngày bắt đầu tuần không hợp lệ" }, { status: 400 });
    }
    const weekEnd = new Date(`${weekStart}T12:00:00`);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const endString = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, "0")}-${String(weekEnd.getDate()).padStart(2, "0")}`;
    const [attendance, weeklyPays] = await Promise.all([
      readWithSupabaseFallback(
        "weekly attendance",
        () => findSupabaseAttendance({ ownerId, timesheetId, employeeName, dateFrom: weekStart, dateTo: endString }),
        async () => {
          await connectToDatabase();
          const records = await Attendance.find({ ownerId, timesheetId, employeeName, date: { $gte: weekStart, $lte: endString } }).sort({ date: 1 }).lean();
          return records.map((record) => ({
            _id: String(record._id),
            ownerId: String(record.ownerId ?? ownerId),
            timesheetId: String(record.timesheetId ?? timesheetId),
            employeeName: record.employeeName,
            date: record.date,
            shifts: record.shifts,
            coworkers: record.coworkers,
            extraHours: record.extraHours,
            totalHours: record.totalHours,
            actualPay: record.actualPay ?? null,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
          }));
        },
      ),
      readWithSupabaseFallback(
        "weekly pay",
        async () => (await findSupabaseWeeklyPay({ ownerId, timesheetId, employeeName, weekStart }))[0] ?? null,
        async () => {
          await connectToDatabase();
          return WeeklyPay.findOne({ ownerId, timesheetId, employeeName, weekStart }).lean();
        },
      ),
    ]);
    return NextResponse.json({ attendance, hourlyRate: weeklyPays?.hourlyRate ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể kết nối cơ sở dữ liệu";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const access = await authorizeTimesheet(body.timesheetId);
    if (access.status !== 200) return NextResponse.json({ error: access.status === 401 ? "Vui lòng đăng nhập" : "Bảng chấm công không tồn tại" }, { status: access.status });
    const ownerId = String(access.account!._id);
    const timesheetId = String(access.timesheet!._id);
    await connectToDatabase();
    const employeeName = String(body.employeeName || "").trim();
    const date = String(body.date || "");
    const requestedShifts = Array.isArray(body.shifts)
      ? body.shifts as { code?: unknown; start?: unknown; end?: unknown }[]
      : [];
    const extraHours = body.extraHours === undefined ? 0 : body.extraHours;
    const actualPay = body.actualPay === undefined || body.actualPay === null ? null : body.actualPay;
    const coworkers = Array.isArray(body.coworkers)
      ? body.coworkers.map((name: unknown) => String(name).trim()).filter(Boolean)
      : [];
    if (!employeeName || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !requestedShifts.length) {
      return NextResponse.json({ error: "Vui lòng nhập tên, ngày làm và chọn ít nhất một ca" }, { status: 400 });
    }
    if (typeof extraHours !== "number" || !Number.isFinite(extraHours) || extraHours < 0) {
      return NextResponse.json({ error: "Giờ làm thêm phải là số không âm" }, { status: 400 });
    }
    if (actualPay !== null && (typeof actualPay !== "number" || !Number.isFinite(actualPay) || actualPay < 0)) {
      return NextResponse.json({ error: "Mức lương riêng của ngày phải là số không âm" }, { status: 400 });
    }
    const codes = requestedShifts.map((shift) => shift?.code);
    if (codes.some((code: unknown) => !isShiftCode(code)) || new Set(codes).size !== codes.length) {
      return NextResponse.json({ error: "Danh sách ca làm không hợp lệ" }, { status: 400 });
    }
    const invalidShiftTime = requestedShifts.some((requestedShift, index) => {
      const code = codes[index] as ShiftCode;
      if (code === "O") return false;
      const option = SHIFT_OPTIONS.find((shift) => shift.code === code)!;
      const start = requestedShift.start === undefined ? option.start : Number(requestedShift.start);
      const end = requestedShift.end === undefined ? option.end : Number(requestedShift.end);
      return !Number.isFinite(start)
        || !Number.isFinite(end)
        || start < 0
        || end > 24
        || end <= start
        || !Number.isInteger(start * 2)
        || !Number.isInteger(end * 2);
    });
    if (invalidShiftTime) {
      return NextResponse.json({ error: "Giờ vào và giờ tan phải hợp lệ, theo bước 30 phút" }, { status: 400 });
    }
    const shifts = (codes as ShiftCode[]).map((code, index) => {
      const option = SHIFT_OPTIONS.find((shift) => shift.code === code)!;
      if (code === "O") return { code: option.code, start: option.start, end: option.end, hours: option.hours };
      const requestedShift = requestedShifts[index];
      const start = requestedShift.start === undefined ? option.start : Number(requestedShift.start);
      const end = requestedShift.end === undefined ? option.end : Number(requestedShift.end);
      return { code: option.code, start, end, hours: end - start };
    });
    if (shifts.some((shift) => shift.code === "O") && shifts.length > 1) {
      return NextResponse.json({ error: "Ca nghỉ không thể chọn cùng ca làm khác" }, { status: 400 });
    }
    const totalHours = shifts.reduce((sum, shift) => sum + shift.hours, 0) + extraHours;
    if (!Number.isFinite(totalHours) || totalHours < 0 || totalHours > 14) {
      return NextResponse.json({ error: "Tổng giờ mỗi ngày không được vượt quá 14 tiếng" }, { status: 400 });
    }
    const record = {
      _id: "",
      ownerId,
      timesheetId,
      employeeName,
      date,
      shifts,
      coworkers,
      extraHours,
      totalHours,
      actualPay,
      updatedAt: new Date(),
    };
    const saved = await writeToBoth(
      "attendance save",
      () => upsertSupabaseAttendance([record]),
      async () => {
        await connectToDatabase();
        return Attendance.findOneAndUpdate(
          { ownerId, timesheetId, employeeName, date },
          { ownerId, timesheetId, employeeName, date, shifts, coworkers, extraHours, totalHours, actualPay },
          { returnDocument: "after", upsert: true, runValidators: true, setDefaultsOnInsert: true },
        );
      },
    );
    return NextResponse.json({ attendance: saved.supabaseResult?.[0] ?? saved.mongoResult, storage: saved.storage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể lưu ngày công";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const access = await authorizeTimesheet(body.timesheetId);
    if (access.status !== 200) return NextResponse.json({ error: access.status === 401 ? "Vui lòng đăng nhập" : "Bảng chấm công không tồn tại" }, { status: access.status });
    const ownerId = String(access.account!._id);
    const timesheetId = String(access.timesheet!._id);
    const employeeName = String(body.employeeName || "").trim();
    const date = String(body.date || "");
    const deleted = await writeToBoth(
      "attendance delete",
      () => deleteSupabaseAttendance({ ownerId, timesheetId, employeeName, dates: [date] }),
      async () => {
        await connectToDatabase();
        return Attendance.deleteOne({ ownerId, timesheetId, employeeName, date });
      },
    );
    return NextResponse.json({ ok: true, storage: deleted.storage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể xóa ngày công";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
