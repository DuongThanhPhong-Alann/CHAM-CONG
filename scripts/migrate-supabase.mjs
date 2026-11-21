import mongoose from "mongoose";
import { readFile } from "node:fs/promises";

const shellEnvironment = { ...process.env };
for (const fileName of [".env", ".env.local"]) {
  try {
    const envFile = await readFile(new URL(`../${fileName}`, import.meta.url), "utf8");
    for (const line of envFile.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match || shellEnvironment[match[1]] !== undefined) continue;
      const value = match[2].replace(/^("|')(.*)\1$/, "$2");
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") throw error;
  }
}

const mongoUri = process.env.MONGODB_URI;
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const batchSize = 500;

if (!mongoUri) throw new Error("MONGODB_URI is required");
if (!supabaseUrl || !supabaseKey) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");

const headers = { apikey: supabaseKey, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" };
if (supabaseKey.startsWith("eyJ")) headers.Authorization = `Bearer ${supabaseKey}`;

async function upsert(table, conflict, rows) {
  for (let start = 0; start < rows.length; start += batchSize) {
    const query = new URLSearchParams({ on_conflict: conflict });
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
      method: "POST",
      headers,
      body: JSON.stringify(rows.slice(start, start + batchSize)),
    });
    if (!response.ok) {
      throw new Error(`Supabase import into ${table} failed (${response.status}): ${await response.text()}`);
    }
  }
}

try {
  await mongoose.connect(mongoUri);
  const database = mongoose.connection.db;
  if (!database) throw new Error("MongoDB connection did not open a database");

  const attendance = await database.collection("attendances").find({
    ownerId: { $type: "string" },
    timesheetId: { $type: "string" },
  }).toArray();
  const attendanceRows = attendance.map((record) => ({
    owner_id: record.ownerId,
    timesheet_id: record.timesheetId,
    employee_name: record.employeeName,
    date: record.date,
    shifts: record.shifts ?? [],
    coworkers: record.coworkers ?? [],
    extra_hours: record.extraHours ?? 0,
    total_hours: record.totalHours,
    actual_pay: record.actualPay ?? null,
    created_at: record.createdAt?.toISOString?.() ?? new Date().toISOString(),
    updated_at: record.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  }));
  await upsert("attendance_records", "owner_id,timesheet_id,employee_name,date", attendanceRows);

  const weeklyPays = await database.collection("weeklypays").find({
    ownerId: { $type: "string" },
    timesheetId: { $type: "string" },
  }).toArray();
  const weeklyPayRows = weeklyPays.map((record) => ({
    owner_id: record.ownerId,
    timesheet_id: record.timesheetId,
    employee_name: record.employeeName,
    week_start: record.weekStart,
    hourly_rate: record.hourlyRate,
    created_at: record.createdAt?.toISOString?.() ?? new Date().toISOString(),
    updated_at: record.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  }));
  await upsert("weekly_pay", "owner_id,timesheet_id,employee_name,week_start", weeklyPayRows);

  console.log(`Processed ${attendanceRows.length} MongoDB attendance records and ${weeklyPayRows.length} weekly pay records.`);
} finally {
  await mongoose.disconnect();
}
