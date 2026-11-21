import { NextResponse } from "next/server";
import { hashPassword, getAuthenticatedAccount, invalidateAuthenticatedAccount, toPublicAccount } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Account from "@/models/Account";
import Attendance from "@/models/Attendance";
import Timesheet from "@/models/Timesheet";
import WeeklyPay from "@/models/WeeklyPay";
import {
  deleteSupabaseAccount,
  deleteSupabaseAttendanceForOwner,
  deleteSupabaseWeeklyPayForOwner,
  findSupabaseAccountById,
  findSupabaseAccounts,
  readWithSupabaseFallback,
  upsertSupabaseAccount,
  writeToBoth,
} from "@/lib/supabase-data";
import { invalidateTimesheetAuthorizationCache } from "@/lib/tenant";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

type AdminAccess = {
  requester: NonNullable<Awaited<ReturnType<typeof getAuthenticatedAccount>>> | null;
  response: NextResponse | null;
};

async function requireAdmin(): Promise<AdminAccess> {
  const requester = await getAuthenticatedAccount();
  if (!requester) return { requester: null, response: NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 }) };
  if (requester.role !== "admin") return { requester, response: NextResponse.json({ error: "Bạn không có quyền quản lý tài khoản" }, { status: 403 }) };
  return { requester, response: null };
}

export async function PUT(request: Request, { params }: Context) {
  const access = await requireAdmin();
  if (access.response) return access.response;
  try {
    const { id } = await params;
    const body = await request.json() as { displayName?: unknown; phone?: unknown; email?: unknown; password?: unknown };
    const displayName = String(body.displayName || "").trim();
    const phone = String(body.phone || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (displayName.length < 2 || displayName.length > 80) return NextResponse.json({ error: "Tên tài khoản cần từ 2 đến 80 ký tự" }, { status: 400 });
    if (!/^\+?[0-9\s()-]{8,20}$/.test(phone)) return NextResponse.json({ error: "Số điện thoại chưa hợp lệ" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Email chưa hợp lệ" }, { status: 400 });
    if (password && password.length < 8) return NextResponse.json({ error: "Mật khẩu mới cần ít nhất 8 ký tự" }, { status: 400 });
    const current = await readWithSupabaseFallback(
      "account update lookup",
      () => findSupabaseAccountById(id),
      async () => {
        await connectToDatabase();
        return Account.findById(id).select("+passwordHash +passwordSalt").lean();
      },
    );
    if (!current) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const fields: Record<string, unknown> = { displayName, phone, email };
    let passwordHash = current.passwordHash;
    let passwordSalt = current.passwordSalt;
    if (password) {
      const credentials = await hashPassword(password);
      passwordHash = credentials.hash;
      passwordSalt = credentials.salt;
      fields.passwordHash = passwordHash;
      fields.passwordSalt = passwordSalt;
    }
    const accountRecord = {
      _id: String(current._id),
      displayName,
      phone,
      email,
      passwordHash,
      passwordSalt,
      role: current.role === "admin" ? "admin" as const : "user" as const,
      createdAt: current.createdAt,
      updatedAt: new Date(),
    };
    const saved = await writeToBoth(
      "account update",
      () => upsertSupabaseAccount(accountRecord),
      async () => {
        await connectToDatabase();
        return Account.findByIdAndUpdate(id, { $set: fields }, { returnDocument: "after", runValidators: true }).select("+passwordHash +passwordSalt");
      },
    );
    const account = saved.supabaseResult ?? saved.mongoResult;
    if (!account) return NextResponse.json({ error: "Không tìm thấy tài khoản" }, { status: 404 });
    invalidateAuthenticatedAccount(id);
    return NextResponse.json({ account: toPublicAccount(account), storage: saved.storage });
  } catch (error) {
    if ((error && typeof error === "object" && "code" in error && error.code === 11000)
      || (error instanceof Error && /"code"\s*:\s*"23505"/.test(error.message))) {
      return NextResponse.json({ error: "Số điện thoại hoặc email đã được sử dụng" }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Không thể cập nhật tài khoản";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await requireAdmin();
  if (access.response) return access.response;
  try {
    const { id } = await params;
    if (String(access.requester?._id) === id) return NextResponse.json({ error: "Không thể xóa tài khoản admin đang đăng nhập" }, { status: 400 });
    const account = await readWithSupabaseFallback(
      "account delete lookup",
      () => findSupabaseAccountById(id),
      async () => {
        await connectToDatabase();
        return Account.findById(id).lean();
      },
    );
    if (!account) return NextResponse.json({ error: "Không tìm thấy tài khoản" }, { status: 404 });
    if (account.role === "admin") {
      const adminCount = await readWithSupabaseFallback(
        "admin account count",
        async () => (await findSupabaseAccounts()).filter((item) => item.role === "admin").length,
        async () => {
          await connectToDatabase();
          return Account.countDocuments({ role: "admin" });
        },
      );
      if (adminCount <= 1) return NextResponse.json({ error: "Không thể xóa admin cuối cùng" }, { status: 400 });
    }
    const cleanup = await writeToBoth(
      "account delete",
      () => Promise.all([
        deleteSupabaseAccount(id),
        deleteSupabaseAttendanceForOwner(id),
        deleteSupabaseWeeklyPayForOwner(id),
      ]),
      async () => {
        await connectToDatabase();
        return Promise.all([
          Attendance.deleteMany({ ownerId: id }),
          WeeklyPay.deleteMany({ ownerId: id }),
          Timesheet.deleteMany({ ownerId: id }),
          Account.deleteOne({ _id: id }),
        ]);
      },
    );
    invalidateAuthenticatedAccount(id);
    invalidateTimesheetAuthorizationCache(id);
    return NextResponse.json({ ok: true, storage: cleanup.storage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể xóa tài khoản";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
