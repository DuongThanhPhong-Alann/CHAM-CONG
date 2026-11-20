import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import WeeklyPay from "@/models/WeeklyPay";
import { authorizeTimesheet } from "@/lib/tenant";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const access = await authorizeTimesheet(body.timesheetId);
    if (access.status !== 200) return NextResponse.json({ error: access.status === 401 ? "Vui lòng đăng nhập" : "Bảng chấm công không tồn tại" }, { status: access.status });
    const ownerId = String(access.account!._id);
    const timesheetId = String(access.timesheet!._id);
    await connectToDatabase();
    const employeeName = String(body.employeeName || "").trim();
    const weekStart = String(body.weekStart || "");
    const hourlyRate = Number(body.hourlyRate);
    if (!employeeName || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !Number.isFinite(hourlyRate) || hourlyRate < 0) {
      return NextResponse.json({ error: "Tên nhân viên, tuần và hệ số lương chưa hợp lệ" }, { status: 400 });
    }
    const weeklyPay = await WeeklyPay.findOneAndUpdate(
      { ownerId, timesheetId, employeeName, weekStart },
      { ownerId, timesheetId, employeeName, weekStart, hourlyRate },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    return NextResponse.json({ hourlyRate: weeklyPay.hourlyRate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể lưu hệ số lương";
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
    await connectToDatabase();
    const employeeName = String(body.employeeName || "").trim();
    const weekStart = String(body.weekStart || "");
    if (!employeeName || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: "Tên nhân viên hoặc tuần chưa hợp lệ" }, { status: 400 });
    }
    await WeeklyPay.deleteOne({ ownerId, timesheetId, employeeName, weekStart });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể xóa hệ số lương";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
