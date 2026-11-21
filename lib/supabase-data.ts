import { after } from "next/server";

export type ShiftRecord = {
  code: string;
  start: number;
  end: number;
  hours: number;
};

export type AttendanceRecord = {
  _id: string;
  ownerId: string;
  timesheetId: string;
  employeeName: string;
  date: string;
  shifts: ShiftRecord[];
  coworkers: string[];
  extraHours: number;
  totalHours: number;
  actualPay: number | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type WeeklyPayRecord = {
  _id: string;
  ownerId: string;
  timesheetId: string;
  employeeName: string;
  weekStart: string;
  hourlyRate: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type AccountRecord = {
  _id: string;
  displayName: string;
  phone: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  role: "admin" | "user";
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type AttendanceFilter = {
  ownerId: string;
  timesheetId: string;
  employeeName: string;
  dateFrom?: string;
  dateTo?: string;
  dates?: string[];
};

type WeeklyPayFilter = {
  ownerId: string;
  timesheetId: string;
  employeeName: string;
  weekStart?: string;
  weekStartFrom?: string;
  weekStartTo?: string;
};

type SupabaseAttendanceRow = {
  id: string;
  owner_id: string;
  timesheet_id: string;
  employee_name: string;
  date: string;
  shifts: ShiftRecord[];
  coworkers: string[] | null;
  extra_hours: number | string;
  total_hours: number | string;
  actual_pay: number | string | null;
  created_at?: string;
  updated_at?: string;
};

type SupabaseWeeklyPayRow = {
  id: string;
  owner_id: string;
  timesheet_id: string;
  employee_name: string;
  week_start: string;
  hourly_rate: number | string;
  created_at?: string;
  updated_at?: string;
};

type SupabaseAccountRow = {
  id: string;
  display_name: string;
  phone: string;
  email: string;
  password_hash: string;
  password_salt: string;
  role: "admin" | "user";
  created_at?: string;
  updated_at?: string;
};

const ATTENDANCE_COLUMNS = "id,owner_id,timesheet_id,employee_name,date,shifts,coworkers,extra_hours,total_hours,actual_pay,created_at,updated_at";
const WEEKLY_PAY_COLUMNS = "id,owner_id,timesheet_id,employee_name,week_start,hourly_rate,created_at,updated_at";
const ACCOUNT_COLUMNS = "id,display_name,phone,email,password_hash,password_salt,role,created_at,updated_at";
const ATTENDANCE_CONFLICT = "owner_id,timesheet_id,employee_name,date";
const WEEKLY_PAY_CONFLICT = "owner_id,timesheet_id,employee_name,week_start";
const SUPABASE_TIMEOUT_MS = 5000;

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are not configured");
  return { url, key };
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.SUPABASE_URL
      && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

async function requestSupabase<T>(table: string, params: URLSearchParams, options: {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  prefer?: string;
} = {}): Promise<T> {
  const { url, key } = getSupabaseConfig();
  const requestUrl = new URL(`${url}/rest/v1/${table}`);
  params.forEach((value, name) => requestUrl.searchParams.set(name, value));

  const headers = new Headers({ apikey: key });
  // Legacy service_role keys are JWTs and still need the Authorization header.
  // New sb_secret keys are not JWTs and must only be sent as an API key.
  if (key.startsWith("eyJ")) headers.set("Authorization", `Bearer ${key}`);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.prefer) headers.set("Prefer", options.prefer);

  const response = await fetch(requestUrl, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase ${options.method ?? "GET"} ${table} failed (${response.status}): ${details}`);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function quotedFilter(value: string) {
  return `eq."${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function addTenantFilters(params: URLSearchParams, filter: { ownerId: string; timesheetId: string; employeeName: string }) {
  params.set("owner_id", quotedFilter(filter.ownerId));
  params.set("timesheet_id", quotedFilter(filter.timesheetId));
  params.set("employee_name", quotedFilter(filter.employeeName));
}

function toAttendanceRecord(row: SupabaseAttendanceRow): AttendanceRecord {
  return {
    _id: row.id,
    ownerId: row.owner_id,
    timesheetId: row.timesheet_id,
    employeeName: row.employee_name,
    date: row.date,
    shifts: row.shifts,
    coworkers: row.coworkers ?? [],
    extraHours: Number(row.extra_hours),
    totalHours: Number(row.total_hours),
    actualPay: row.actual_pay === null ? null : Number(row.actual_pay),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toWeeklyPayRecord(row: SupabaseWeeklyPayRow): WeeklyPayRecord {
  return {
    _id: row.id,
    ownerId: row.owner_id,
    timesheetId: row.timesheet_id,
    employeeName: row.employee_name,
    weekStart: row.week_start,
    hourlyRate: Number(row.hourly_rate),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAccountRecord(row: SupabaseAccountRow): AccountRecord {
  return {
    _id: row.id,
    displayName: row.display_name,
    phone: row.phone,
    email: row.email,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function timestamp(value?: string | Date) {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

function toSupabaseAttendance(record: Omit<AttendanceRecord, "_id"> & { _id?: string }) {
  const row: Record<string, unknown> = {
    owner_id: record.ownerId,
    timesheet_id: record.timesheetId,
    employee_name: record.employeeName,
    date: record.date,
    shifts: record.shifts,
    coworkers: record.coworkers,
    extra_hours: record.extraHours,
    total_hours: record.totalHours,
    actual_pay: record.actualPay,
    updated_at: timestamp(record.updatedAt),
  };
  if (record.createdAt) row.created_at = timestamp(record.createdAt);
  return row;
}

function toSupabaseWeeklyPay(record: Omit<WeeklyPayRecord, "_id"> & { _id?: string }) {
  const row: Record<string, unknown> = {
    owner_id: record.ownerId,
    timesheet_id: record.timesheetId,
    employee_name: record.employeeName,
    week_start: record.weekStart,
    hourly_rate: record.hourlyRate,
    updated_at: timestamp(record.updatedAt),
  };
  if (record.createdAt) row.created_at = timestamp(record.createdAt);
  return row;
}

function toSupabaseAccount(record: AccountRecord) {
  return {
    id: record._id,
    display_name: record.displayName,
    phone: record.phone,
    email: record.email,
    password_hash: record.passwordHash,
    password_salt: record.passwordSalt,
    role: record.role,
    ...(record.createdAt ? { created_at: timestamp(record.createdAt) } : {}),
    updated_at: timestamp(record.updatedAt),
  };
}

export async function findSupabaseAccountById(id: string): Promise<AccountRecord | null> {
  const params = new URLSearchParams({ select: ACCOUNT_COLUMNS, id: quotedFilter(id), limit: "1" });
  const rows = await requestSupabase<SupabaseAccountRow[]>("app_accounts", params);
  return rows[0] ? toAccountRecord(rows[0]) : null;
}

export async function findSupabaseAccountByIdentifier(identifier: string): Promise<AccountRecord | null> {
  const email = identifier.toLowerCase();
  const params = new URLSearchParams({
    select: ACCOUNT_COLUMNS,
    or: `(phone.${quotedFilter(identifier)},email.${quotedFilter(email)})`,
    limit: "1",
  });
  const rows = await requestSupabase<SupabaseAccountRow[]>("app_accounts", params);
  return rows[0] ? toAccountRecord(rows[0]) : null;
}

export async function findSupabaseAccounts(): Promise<AccountRecord[]> {
  const params = new URLSearchParams({ select: ACCOUNT_COLUMNS, order: "created_at.asc" });
  const rows = await requestSupabase<SupabaseAccountRow[]>("app_accounts", params);
  return rows.map(toAccountRecord);
}

export async function upsertSupabaseAccount(record: AccountRecord) {
  const params = new URLSearchParams({ on_conflict: "id", select: ACCOUNT_COLUMNS });
  const rows = await requestSupabase<SupabaseAccountRow[]>("app_accounts", params, {
    method: "POST",
    body: toSupabaseAccount(record),
    prefer: "resolution=merge-duplicates,return=representation",
  });
  return rows[0] ? toAccountRecord(rows[0]) : undefined;
}

export async function deleteSupabaseAccount(id: string) {
  const params = new URLSearchParams({ id: quotedFilter(id) });
  await requestSupabase<void>("app_accounts", params, { method: "DELETE" });
}

export async function findSupabaseAttendance(filter: AttendanceFilter): Promise<AttendanceRecord[]> {
  const params = new URLSearchParams({ select: ATTENDANCE_COLUMNS, order: "date.asc" });
  addTenantFilters(params, filter);
  if (filter.dateFrom) params.set("date", `gte.${filter.dateFrom}`);
  if (filter.dateTo) params.set("date", `lte.${filter.dateTo}`);
  if (filter.dateFrom && filter.dateTo) {
    params.delete("date");
    params.set("and", `(date.gte.${filter.dateFrom},date.lte.${filter.dateTo})`);
  }
  if (filter.dates?.length) params.set("date", `in.(${filter.dates.join(",")})`);
  const rows = await requestSupabase<SupabaseAttendanceRow[]>("attendance_records", params);
  return rows.map(toAttendanceRecord);
}

export async function findSupabaseWeeklyPay(filter: WeeklyPayFilter): Promise<WeeklyPayRecord[]> {
  const params = new URLSearchParams({ select: WEEKLY_PAY_COLUMNS });
  addTenantFilters(params, filter);
  if (filter.weekStart) params.set("week_start", quotedFilter(filter.weekStart));
  if (filter.weekStartFrom && filter.weekStartTo) {
    params.set("and", `(week_start.gte.${filter.weekStartFrom},week_start.lte.${filter.weekStartTo})`);
  } else if (filter.weekStartFrom) {
    params.set("week_start", `gte.${filter.weekStartFrom}`);
  } else if (filter.weekStartTo) {
    params.set("week_start", `lte.${filter.weekStartTo}`);
  }
  const rows = await requestSupabase<SupabaseWeeklyPayRow[]>("weekly_pay", params);
  return rows.map(toWeeklyPayRecord);
}

export async function upsertSupabaseAttendance(records: AttendanceRecord[]) {
  if (!records.length) return [];
  const params = new URLSearchParams({ on_conflict: ATTENDANCE_CONFLICT, select: ATTENDANCE_COLUMNS });
  const rowsToSave = records.map((record) => {
    const row = toSupabaseAttendance(record);
    // PostgREST expects one column shape for a bulk JSON payload.
    if (records.length > 1 && !("created_at" in row)) row.created_at = timestamp();
    return row;
  });
  const rows = await requestSupabase<SupabaseAttendanceRow[]>("attendance_records", params, {
    method: "POST",
    body: rowsToSave,
    prefer: "resolution=merge-duplicates,return=representation",
  });
  return rows.map(toAttendanceRecord);
}

export async function upsertSupabaseWeeklyPay(record: WeeklyPayRecord) {
  const params = new URLSearchParams({ on_conflict: WEEKLY_PAY_CONFLICT, select: WEEKLY_PAY_COLUMNS });
  const rows = await requestSupabase<SupabaseWeeklyPayRow[]>("weekly_pay", params, {
    method: "POST",
    body: toSupabaseWeeklyPay(record),
    prefer: "resolution=merge-duplicates,return=representation",
  });
  return rows[0] ? toWeeklyPayRecord(rows[0]) : undefined;
}

export async function deleteSupabaseAttendance(filter: AttendanceFilter) {
  const params = new URLSearchParams();
  addTenantFilters(params, filter);
  if (filter.dateFrom && filter.dateTo) params.set("and", `(date.gte.${filter.dateFrom},date.lte.${filter.dateTo})`);
  else if (filter.dateFrom) params.set("date", `gte.${filter.dateFrom}`);
  else if (filter.dateTo) params.set("date", `lte.${filter.dateTo}`);
  if (filter.dates?.length) params.set("date", `in.(${filter.dates.join(",")})`);
  params.set("select", "id");
  const deleted = await requestSupabase<{ id: string }[]>("attendance_records", params, {
    method: "DELETE",
    prefer: "return=representation",
  });
  return deleted.length;
}

export async function deleteSupabaseAttendanceForOwner(ownerId: string) {
  const params = new URLSearchParams({ owner_id: quotedFilter(ownerId) });
  await requestSupabase<void>("attendance_records", params, { method: "DELETE" });
}

export async function deleteSupabaseWeeklyPay(filter: WeeklyPayFilter) {
  const params = new URLSearchParams();
  addTenantFilters(params, filter);
  if (filter.weekStart) params.set("week_start", quotedFilter(filter.weekStart));
  await requestSupabase<void>("weekly_pay", params, { method: "DELETE" });
}

export async function deleteSupabaseWeeklyPayForOwner(ownerId: string) {
  const params = new URLSearchParams({ owner_id: quotedFilter(ownerId) });
  await requestSupabase<void>("weekly_pay", params, { method: "DELETE" });
}

export async function readWithSupabaseFallback<T>(label: string, supabaseRead: () => Promise<T>, mongoRead: () => Promise<T>): Promise<T> {
  if (!isSupabaseConfigured()) return mongoRead();
  try {
    return await supabaseRead();
  } catch (error) {
    console.warn(`[storage] Supabase read failed for ${label}; falling back to MongoDB`, error);
    return mongoRead();
  }
}

export async function writeToBoth<TSupabase, TMongo>(label: string, supabaseWrite: () => Promise<TSupabase>, mongoWrite: () => Promise<TMongo>) {
  if (!isSupabaseConfigured()) {
    const mongoResult = await mongoWrite();
    return { storage: "mongodb", supabaseResult: undefined, mongoResult };
  }

  let supabaseResult: TSupabase;
  try {
    supabaseResult = await supabaseWrite();
  } catch (supabaseError) {
    if (supabaseError instanceof Error && /"code"\s*:\s*"23505"/.test(supabaseError.message)) throw supabaseError;
    console.warn(`[storage] Supabase write failed for ${label}; saving synchronously to MongoDB`, supabaseError);
    const mongoResult = await mongoWrite();
    after(async () => {
      try {
        await supabaseWrite();
      } catch (retryError) {
        console.error(`[storage] Deferred Supabase retry failed for ${label}`, retryError);
      }
    });
    return { storage: "mongodb", supabaseResult: undefined, mongoResult, supabaseRetry: "scheduled" as const };
  }

  after(async () => {
    try {
      await mongoWrite();
    } catch (mongoError) {
      console.error(`[storage] Deferred MongoDB mirror write failed for ${label}`, mongoError);
    }
  });

  return { storage: "supabase", supabaseResult, mongoResult: undefined, mongoMirror: "scheduled" as const };
}
