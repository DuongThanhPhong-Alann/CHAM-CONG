import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { localDateString } from "@/lib/dates";
import { SHIFT_OPTIONS, isShiftCode } from "@/lib/shifts";
import Attendance from "@/models/Attendance";
import { authorizeTimesheet } from "@/lib/tenant";
import {
  deleteSupabaseAttendance,
  findSupabaseAttendance,
  readWithSupabaseFallback,
  upsertSupabaseAttendance,
  writeToBoth,
  type AttendanceRecord,
} from "@/lib/supabase-data";

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
    const body = await request.json() as Record<string, unknown>;
    const access = await authorizeTimesheet(body.timesheetId);
    if (access.status !== 200) return NextResponse.json({ error: access.status === 401 ? "Vui lòng đăng nhập" : "Bảng chấm công không tồn tại" }, { status: access.status });
    const ownerId = String(access.account!._id);
    const timesheetId = String(access.timesheet!._id);
    await connectToDatabase();
    const { employeeName, dates } = readRequest(body);
    const shiftCode = body.shiftCode;
    if (!employeeName || dates.length === 0 || dates.length > 31 || dates.some((date) => !isValidDate(date))) {
      return NextResponse.json({ error: "Tên nhân viên hoặc danh sách ngày chưa hợp lệ" }, { status: 400 });
    }
    if (!isShiftCode(shiftCode) || shiftCode === "O") {
      return NextResponse.json({ error: "Chọn một ca làm hợp lệ để ghi cho các ngày" }, { status: 400 });
    }

    const shift = SHIFT_OPTIONS.find((option) => option.code === shiftCode)!;
    const existingRecords = await readWithSupabaseFallback(
      "bulk attendance lookup",
      () => findSupabaseAttendance({ ownerId, timesheetId, employeeName, dates }),
      async () => {
        const records = await Attendance.find({ ownerId, timesheetId, employeeName, date: { $in: dates } }).lean();
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
    );
    const existingByDate = new Map(existingRecords.map((record) => [record.date, record] as const));
    let skipped = 0;
    let invalidDate = "";
    const operations: Parameters<typeof Attendance.bulkWrite>[0] = [];
    const recordsToSave: AttendanceRecord[] = [];
    const updatedAt = new Date();
    for (const date of dates) {
      const existing = existingByDate.get(date);
      if (existing?.shifts.some((item: { code: string }) => item.code === shift.code)) {
        skipped += 1;
        continue;
      }

      if (existing) {
        const extraHours = existing.extraHours ?? 0;
        const totalHours = existing.totalHours + shift.hours;
        if (totalHours > 14) {
          invalidDate = date;
          continue;
        }
        const shifts = [
          ...existing.shifts.filter((item: { code: string }) => item.code !== "O"),
          { code: shift.code, start: shift.start, end: shift.end, hours: shift.hours },
        ];
        recordsToSave.push({ ...existing, shifts, extraHours, totalHours, updatedAt });
        operations.push({
          updateOne: {
            filter: { ownerId, timesheetId, employeeName, date },
            update: {
              $set: {
                shifts,
                coworkers: existing.coworkers,
                extraHours,
                totalHours,
                actualPay: existing.actualPay,
              },
              $setOnInsert: { ownerId, timesheetId, employeeName, date },
            },
            upsert: true,
          },
        });
        continue;
      }

      recordsToSave.push({
        _id: "",
        ownerId,
        timesheetId,
        employeeName,
        date,
        shifts: [{ code: shift.code, start: shift.start, end: shift.end, hours: shift.hours }],
        coworkers: [],
        extraHours: 0,
        totalHours: shift.hours,
        actualPay: null,
        createdAt: updatedAt,
        updatedAt,
      });
      operations.push({
        updateOne: {
          filter: { ownerId, timesheetId, employeeName, date },
          update: {
            $setOnInsert: {
              employeeName,
              ownerId,
              timesheetId,
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
      });
    }

    if (invalidDate) {
      return NextResponse.json({ error: `Thêm ca ${shift.code} sẽ làm ngày ${invalidDate} vượt quá 14 giờ` }, { status: 400 });
    }
    const saved = operations.length > 0
      ? await writeToBoth(
        "bulk attendance save",
        () => upsertSupabaseAttendance(recordsToSave),
        async () => {
          await connectToDatabase();
          return Attendance.bulkWrite(operations);
        },
      )
      : { storage: "unchanged" };
    return NextResponse.json({ added: operations.length, skipped, storage: saved.storage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể ghi công nhiều ngày";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const access = await authorizeTimesheet(body.timesheetId);
    if (access.status !== 200) return NextResponse.json({ error: access.status === 401 ? "Vui lòng đăng nhập" : "Bảng chấm công không tồn tại" }, { status: access.status });
    const ownerId = String(access.account!._id);
    const timesheetId = String(access.timesheet!._id);
    await connectToDatabase();
    const { employeeName, dates } = readRequest(body);
    if (!employeeName || dates.length === 0 || dates.length > 31 || dates.some((date) => !isValidDate(date))) {
      return NextResponse.json({ error: "Tên nhân viên hoặc danh sách ngày chưa hợp lệ" }, { status: 400 });
    }

    const result = await writeToBoth(
      "bulk attendance delete",
      () => deleteSupabaseAttendance({ ownerId, timesheetId, employeeName, dates }),
      async () => {
        await connectToDatabase();
        return Attendance.deleteMany({ ownerId, timesheetId, employeeName, date: { $in: dates } });
      },
    );
    const deletedCount = result.mongoResult && typeof result.mongoResult === "object" && "deletedCount" in result.mongoResult
      ? result.mongoResult.deletedCount
      : undefined;
    return NextResponse.json({ deletedCount, storage: result.storage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể xóa công nhiều ngày";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
