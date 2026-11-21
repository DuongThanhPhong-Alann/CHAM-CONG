import { randomBytes, scrypt, timingSafeEqual, createHmac } from "node:crypto";
import { promisify } from "node:util";
import mongoose from "mongoose";
import { cookies } from "next/headers";
import { findSupabaseAccountById, readWithSupabaseFallback } from "@/lib/supabase-data";
import { connectToDatabase } from "@/lib/mongodb";
import Account from "@/models/Account";
import Attendance from "@/models/Attendance";
import Timesheet from "@/models/Timesheet";
import WeeklyPay from "@/models/WeeklyPay";

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = "attendance_session";
const SESSION_SECONDS = 60 * 60 * 24 * 14;
export const DEFAULT_TIMESHEET_NAME = "Thăng Hoa Thạch Lam";

export type PublicAccount = {
  id: string;
  displayName: string;
  phone: string;
  email: string;
  role: "admin" | "user";
};

type AuthenticatedAccount = {
  _id: unknown;
  displayName: string;
  phone: string;
  email: string;
  role: string;
  public: PublicAccount;
  [key: string]: unknown;
};

type AccountCacheEntry = { account: AuthenticatedAccount; expiresAt: number };
type AuthState = {
  accountCache?: Map<string, AccountCacheEntry>;
  accountLookupPromises?: Map<string, Promise<AuthenticatedAccount | null>>;
  bootstrapPromise?: Promise<unknown> | null;
};

const globalWithAuthState = globalThis as typeof globalThis & { authState?: AuthState };
const authState = globalWithAuthState.authState ?? {
  accountCache: new Map<string, AccountCacheEntry>(),
  accountLookupPromises: new Map<string, Promise<AuthenticatedAccount | null>>(),
  bootstrapPromise: null,
};
globalWithAuthState.authState = authState;
const AUTH_CACHE_MS = 5000;

function sessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Thiếu AUTH_SESSION_SECRET (cần tối thiểu 32 ký tự)");
  return secret;
}

export async function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const key = await scryptAsync(password, salt, 64) as Buffer;
  return { salt, hash: key.toString("hex") };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const { hash } = await hashPassword(password, salt);
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function toPublicAccount(account: { _id: unknown; displayName: string; phone: string; email: string; role: string }): PublicAccount {
  return {
    id: String(account._id),
    displayName: account.displayName,
    phone: account.phone,
    email: account.email,
    role: account.role === "admin" ? "admin" : "user",
  };
}

function signSession(accountId: string) {
  const payload = Buffer.from(JSON.stringify({ sub: accountId, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readSession(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", sessionSecret()).update(payload).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown; exp?: unknown };
    if (typeof value.sub !== "string" || typeof value.exp !== "number" || value.exp <= Date.now() / 1000) return null;
    return value.sub;
  } catch {
    return null;
  }
}

export async function setSessionCookie(accountId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, signSession(accountId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
}

export function invalidateAuthenticatedAccount(accountId?: string) {
  if (accountId) {
    authState.accountCache?.delete(accountId);
    authState.accountLookupPromises?.delete(accountId);
  } else {
    authState.accountCache?.clear();
    authState.accountLookupPromises?.clear();
  }
}

export function rememberAuthenticatedAccount(account: PublicAccount) {
  authState.accountCache?.set(account.id, {
    account: { ...account, _id: account.id, public: account },
    expiresAt: Date.now() + AUTH_CACHE_MS,
  });
}

export async function getAuthenticatedAccount(): Promise<AuthenticatedAccount | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  let accountId: string | null;
  try {
    accountId = readSession(token);
  } catch {
    return null;
  }
  if (!accountId) return null;
  const cached = authState.accountCache?.get(accountId);
  if (cached && cached.expiresAt > Date.now()) return cached.account;
  authState.accountCache?.delete(accountId);
  const pending = authState.accountLookupPromises?.get(accountId);
  if (pending) return pending;

  const lookup = (async () => {
    const readFromMongo = async () => {
      await connectToDatabase();
      return Account.findById(accountId).lean();
    };
    const account = await readWithSupabaseFallback(
      "authenticated account lookup",
      async () => (await findSupabaseAccountById(accountId)) ?? readFromMongo(),
      readFromMongo,
    );
    if (!account) return null;
    const authenticatedAccount = {
      _id: account._id,
      displayName: account.displayName,
      phone: account.phone,
      email: account.email,
      role: account.role,
      public: toPublicAccount(account),
    } as AuthenticatedAccount;
    authState.accountCache?.set(accountId, { account: authenticatedAccount, expiresAt: Date.now() + AUTH_CACHE_MS });
    return authenticatedAccount;
  })();
  authState.accountLookupPromises?.set(accountId, lookup);
  try {
    return await lookup;
  } finally {
    const lookups = authState.accountLookupPromises;
    if (lookups?.get(accountId) === lookup) {
      lookups.delete(accountId);
    }
  }
}

export async function ensureDefaultTimesheet(ownerId: string, name = DEFAULT_TIMESHEET_NAME) {
  await connectToDatabase();
  return Timesheet.findOneAndUpdate(
    { ownerId, name },
    { $setOnInsert: { ownerId, name, logicKey: "standard" } },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  );
}

async function runBootstrapAdminAndMigrate() {
  await connectToDatabase();
  sessionSecret();
  const migrations = mongoose.connection.collection<{ _id: string; adminId?: string; completedAt?: Date; ownerId?: string; timesheetId?: string }>("app_migrations");
  const migration = await migrations.findOne({ _id: "tenant-isolation-v1" });
  if (migration?.completedAt && migration.adminId) return null;
  let admin = migration?.adminId ? await Account.findById(String(migration.adminId)) : null;

  if (!admin) {
    const phone = (process.env.AUTH_ADMIN_PHONE || "").trim();
    const email = (process.env.AUTH_ADMIN_EMAIL || "").trim().toLowerCase();
    const password = process.env.AUTH_ADMIN_PASSWORD || "";
    const displayName = (process.env.AUTH_ADMIN_NAME || "Thanh Phong").trim();
    if (!phone || !email || !password || password.length < 8) {
      throw new Error("Cần cấu hình AUTH_ADMIN_PHONE, AUTH_ADMIN_EMAIL và AUTH_ADMIN_PASSWORD (ít nhất 8 ký tự)");
    }
    admin = await Account.findOne({ $or: [{ phone }, { email }] });
    if (!admin) {
      admin = await Account.findOne({ role: "admin" });
    }
    if (!admin) {
      const credentials = await hashPassword(password);
      try {
        admin = await Account.create({ displayName, phone, email, passwordHash: credentials.hash, passwordSalt: credentials.salt, role: "admin" });
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
        admin = await Account.findOne({ $or: [{ phone }, { email }, { role: "admin" }] });
        if (!admin) throw error;
      }
    } else if (admin.role !== "admin") {
      admin.role = "admin";
      await admin.save();
    }
  }
  if (!admin) throw new Error("Không thể khởi tạo tài khoản admin");

  const sheet = await ensureDefaultTimesheet(String(admin._id));
  if (!sheet) throw new Error("Không tạo được bảng chấm công mặc định cho admin");
  const ownerId = String(admin._id);
  const timesheetId = String(sheet._id);
  if (!migration) {
    await Promise.all([
      Attendance.collection.updateMany({ ownerId: { $exists: false } }, { $set: { ownerId, timesheetId } }),
      WeeklyPay.collection.updateMany({ ownerId: { $exists: false } }, { $set: { ownerId, timesheetId } }),
      Attendance.collection.updateMany({ ownerId, timesheetId: { $exists: false } }, { $set: { timesheetId } }),
      WeeklyPay.collection.updateMany({ ownerId, timesheetId: { $exists: false } }, { $set: { timesheetId } }),
    ]);
    try {
      await Attendance.collection.dropIndex("employeeName_1_date_1");
    } catch (error) {
      if (!(error instanceof Error) || !/index not found|ns not found/i.test(error.message)) throw error;
    }
    try {
      await WeeklyPay.collection.dropIndex("employeeName_1_weekStart_1");
    } catch (error) {
      if (!(error instanceof Error) || !/index not found|ns not found/i.test(error.message)) throw error;
    }
    await Promise.all([Attendance.syncIndexes(), WeeklyPay.syncIndexes()]);
    await migrations.updateOne(
      { _id: "tenant-isolation-v1" },
      { $set: { completedAt: new Date(), ownerId, timesheetId, adminId: ownerId } },
      { upsert: true },
    );
  }
  return admin;
}

export async function bootstrapAdminAndMigrate() {
  if (!authState.bootstrapPromise) {
    authState.bootstrapPromise = runBootstrapAdminAndMigrate().catch((error) => {
      authState.bootstrapPromise = null;
      throw error;
    });
  }
  return authState.bootstrapPromise!;
}
