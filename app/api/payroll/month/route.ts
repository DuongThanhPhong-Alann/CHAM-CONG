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
    const firstWeekOfMonth = mondayOf(firstDate);
    const firstWeek = firstWeekOfMonth < firstDate ? addDays(firstWeekOfMonth, 7) : firstWeekOfMonth;
    const lastWeek = mondayOf(lastDate);
    const endDate = addDays(lastWeek, 6);

    const [attendance, weeklyPays] = await Promise.all([
      Attendance.find({ employeeName, date: { $gte: firstWeek, $lte: endDate } })
        .select({ date: 1, totalHours: 1 })
        .lean(),
      WeeklyPay.find({ employeeName, weekStart: { $gte: firstWeek, $lte: lastWeek } })
        .select({ weekStart: 1, hourlyRate: 1 })
        .lean(),
    ]);

    const hoursByWeek = new Map<string, number>();
    for (const record of attendance) {
      const weekStart = mondayOf(record.date);
      hoursByWeek.set(weekStart, (hoursByWeek.get(weekStart) || 0) + record.totalHours);
    }
    const rateByWeek = new Map(weeklyPays.map((pay) => [pay.weekStart, pay.hourlyRate]));
    const weeks: {
      weekStart: string;
      weekEnd: string;
      hours: number;
      hourlyRate: number | null;
      pay: number | null;
    }[] = [];
    for (let weekStart = firstWeek; weekStart <= lastWeek; weekStart = addDays(weekStart, 7)) {
      const hours = hoursByWeek.get(weekStart) || 0;
      const hourlyRate = rateByWeek.get(weekStart) ?? null;
      weeks.push({
        weekStart,
        weekEnd: addDays(weekStart, 6),
        hours,
        hourlyRate,
        pay: hours === 0 ? 0 : hourlyRate === null ? null : hours * hourlyRate,
      });
    }

    return NextResponse.json({ weeks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tải dữ liệu tính công tháng";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
