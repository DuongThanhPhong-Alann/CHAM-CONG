import { NextResponse } from "next/server";
import { addDays, mondayOf } from "@/lib/dates";
import { connectToDatabase } from "@/lib/mongodb";
import Attendance from "@/models/Attendance";
import WeeklyPay from "@/models/WeeklyPay";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
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
      Attendance.find({ employeeName, date: { $gte: firstDate, $lte: lastDate } })
        .select({ date: 1, shifts: 1, coworkers: 1, totalHours: 1, extraHours: 1, actualPay: 1 })
        .sort({ date: 1 })
        .lean(),
      WeeklyPay.find({ employeeName, weekStart: { $gte: firstWeek, $lte: lastWeek } })
        .select({ weekStart: 1, hourlyRate: 1 })
        .lean(),
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
        if (record.actualPay != null) return total + record.actualPay;
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
