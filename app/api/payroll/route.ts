import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import WeeklyPay from "@/models/WeeklyPay";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    await connectToDatabase();
    const body = await request.json();
    const employeeName = String(body.employeeName || "").trim();
    const weekStart = String(body.weekStart || "");
    const hourlyRate = Number(body.hourlyRate);
    if (!employeeName || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !Number.isFinite(hourlyRate) || hourlyRate < 0) {
      return NextResponse.json({ error: "Tên nhân viên, tuần và hệ số lương chưa hợp lệ." }, { status: 400 });
    }
    const weeklyPay = await WeeklyPay.findOneAndUpdate(
      { employeeName, weekStart },
      { employeeName, weekStart, hourlyRate },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    return NextResponse.json({ hourlyRate: weeklyPay.hourlyRate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể lưu hệ số lương.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
