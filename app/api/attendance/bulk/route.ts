import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { localDateString } from "@/lib/dates";
import { SHIFT_OPTIONS, isShiftCode } from "@/lib/shifts";
import Attendance from "@/models/Attendance";

export const runtime = "nodejs";

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDateString(date) === value;
}

function readRequest(body: Record<string, unknown>) {
  const employeeName = String(body.employeeName || "").trim();
  const dates = Array.isArray(body.dates)
    ? [...new Set(body.dates.map((date) => String(date)))]
    : [];
  return { employeeName, dates };
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const body = await request.json() as Record<string, unknown>;
    const { employeeName, dates } = readRequest(body);
    const shiftCode = body.shiftCode;
    if (!employeeName || dates.length === 0 || dates.length > 31 || dates.some((date) => !isValidDate(date))) {
      return NextResponse.json({ error: "Tên nhân viên hoặc danh sách ngày chưa hợp lệ" }, { status: 400 });
    }
    if (!isShiftCode(shiftCode) || shiftCode === "O") {
      return NextResponse.json({ error: "Chọn một ca làm hợp lệ để ghi cho các ngày" }, { status: 400 });
    }

    const shift = SHIFT_OPTIONS.find((option) => option.code === shiftCode)!;
    const existingRecords = await Attendance.find({ employeeName, date: { $in: dates } }).lean();
    const existingByDate = new Map(existingRecords.map((record) => [record.date, record] as const));
    let skipped = 0;
    let invalidDate = "";
    const operations = dates.flatMap((date) => {
      const existing = existingByDate.get(date);
      if (existing?.shifts.some((item) => item.code === shift.code)) {
        skipped += 1;
        return [];
      }

      if (existing) {
        const extraHours = existing.extraHours ?? 0;
        const totalHours = existing.totalHours + shift.hours;
        if (totalHours > 14) {
          invalidDate = date;
          return [];
        }
        const shifts = [
          ...existing.shifts.filter((item) => item.code !== "O"),
          { code: shift.code, start: shift.start, end: shift.end, hours: shift.hours },
        ];
        return [{ updateOne: { filter: { employeeName, date }, update: { $set: { shifts, extraHours, totalHours } } } }];
      }

      return [{
        updateOne: {
          filter: { employeeName, date },
          update: {
            $setOnInsert: {
              employeeName,
              date,
              shifts: [{ code: shift.code, start: shift.start, end: shift.end, hours: shift.hours }],
              coworkers: [],
              extraHours: 0,
              totalHours: shift.hours,
              actualPay: null,
            },
          },
          upsert: true,
        },
      }];
    });

    if (invalidDate) {
      return NextResponse.json({ error: `Thêm ca ${shift.code} sẽ làm ngày ${invalidDate} vượt quá 14 giờ` }, { status: 400 });
    }
    if (operations.length > 0) await Attendance.bulkWrite(operations);
    return NextResponse.json({ added: operations.length, skipped });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể ghi công nhiều ngày";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await connectToDatabase();
    const body = await request.json() as Record<string, unknown>;
    const { employeeName, dates } = readRequest(body);
    if (!employeeName || dates.length === 0 || dates.length > 31 || dates.some((date) => !isValidDate(date))) {
      return NextResponse.json({ error: "Tên nhân viên hoặc danh sách ngày chưa hợp lệ" }, { status: 400 });
    }

    const result = await Attendance.deleteMany({ employeeName, date: { $in: dates } });
    return NextResponse.json({ deletedCount: result.deletedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể xóa công nhiều ngày";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
