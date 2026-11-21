import { NextResponse } from "next/server";
import { addDays, mondayOf } from "@/lib/dates";
import { connectToDatabase } from "@/lib/mongodb";
import Attendance from "@/models/Attendance";
import WeeklyPay from "@/models/WeeklyPay";
import { authorizeTimesheet } from "@/lib/tenant";
import {
  findSupabaseAttendance,
  findSupabaseWeeklyPay,
  readWithSupabaseFallback,
} from "@/lib/supabase-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await authorizeTimesheet(searchParams.get("timesheetId"));
    if (access.status !== 200) return NextResponse.json({ error: access.status === 401 ? "Vui lòng đăng nhập" : "Bảng chấm công không tồn tại" }, { status: access.status });
    const ownerId = String(access.account!._id);
    const timesheetId = String(access.timesheet!._id);
    await connectToDatabase();
    const employeeName = (searchParams.get("employee") || "Thanh Phong").trim();
    const month = searchParams.get("month") || "";
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!employeeName || !match || Number(match[2]) < 1 || Number(match[2]) > 12) {
      return NextResponse.json({ error: "Tên nhân viên hoặc tháng chưa hợp lệ" }, { status: 400 });
    }

    const year = Number(match[1]);
    const monthNumber = Number(match[2]);
    const firstDate = `${match[1]}-${match[2]}-01`;
    const lastDay = new Date(year, monthNumber, 0, 12).getDate();
    const lastDate = `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`;
    const firstWeek = mondayOf(firstDate);
    const lastWeek = mondayOf(lastDate);

    const [attendance, weeklyPays] = await Promise.all([
      readWithSupabaseFallback(
        "monthly attendance",
        () => findSupabaseAttendance({ ownerId, timesheetId, employeeName, dateFrom: firstDate, dateTo: lastDate }),
        async () => {
          await connectToDatabase();
          const records = await Attendance.find({ ownerId, timesheetId, employeeName, date: { $gte: firstDate, $lte: lastDate } })
            .select({ date: 1, shifts: 1, coworkers: 1, totalHours: 1, extraHours: 1, actualPay: 1, createdAt: 1, updatedAt: 1 })
            .sort({ date: 1 })
            .lean();
          return records.map((record) => ({
            _id: String(record._id),
            ownerId: String(record.ownerId ?? ownerId),
            timesheetId: String(record.timesheetId ?? timesheetId),
            employeeName: record.employeeName,
            date: record.date,
            shifts: record.shifts,
            coworkers: record.coworkers,
            totalHours: record.totalHours,
            extraHours: record.extraHours,
            actualPay: record.actualPay ?? null,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
          }));
        },
      ),
      readWithSupabaseFallback(
        "monthly weekly pay",
        () => findSupabaseWeeklyPay({ ownerId, timesheetId, employeeName, weekStartFrom: firstWeek, weekStartTo: lastWeek }),
        async () => {
          await connectToDatabase();
          const records = await WeeklyPay.find({ ownerId, timesheetId, employeeName, weekStart: { $gte: firstWeek, $lte: lastWeek } })
            .select({ weekStart: 1, hourlyRate: 1 })
            .lean();
          return records.map((record) => ({ weekStart: record.weekStart, hourlyRate: record.hourlyRate }));
        },
      ),
    ]);

    const attendanceByWeek = new Map<string, typeof attendance>();
    for (const record of attendance) {
      const weekStart = mondayOf(record.date);
      const weekRecords = attendanceByWeek.get(weekStart) || [];
      weekRecords.push(record);
      attendanceByWeek.set(weekStart, weekRecords);
    }
    const rateByWeek = new Map(weeklyPays.map((pay) => [pay.weekStart, pay.hourlyRate]));
    const weeks: {
      weekStart: string;
      weekEnd: string;
      periodStart: string;
      periodEnd: string;
      hours: number;
      hourlyRate: number | null;
      missingRateDays: number;
      pay: number;
    }[] = [];
    for (let weekStart = firstWeek; weekStart <= lastWeek; weekStart = addDays(weekStart, 7)) {
      const weekRecords = attendanceByWeek.get(weekStart) || [];
      const hours = weekRecords.reduce((total, record) => total + record.totalHours, 0);
      const hourlyRate = rateByWeek.get(weekStart) ?? null;
      const missingRateDays = weekRecords.filter((record) => record.totalHours > 0 && record.actualPay == null && hourlyRate === null).length;
      const pay = weekRecords.reduce((total, record) => {
        if (record.actualPay != null) return total + record.totalHours * record.actualPay;
        return total + (hourlyRate === null ? 0 : record.totalHours * hourlyRate);
      }, 0);
      const weekEnd = addDays(weekStart, 6);
      weeks.push({
        weekStart,
        weekEnd,
        periodStart: weekStart < firstDate ? firstDate : weekStart,
        periodEnd: weekEnd > lastDate ? lastDate : weekEnd,
        hours,
        hourlyRate,
        missingRateDays,
        pay,
      });
    }

    return NextResponse.json({
      weeks,
      attendance,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tải dữ liệu tính công tháng";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
