import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { hashPassword, getAuthenticatedAccount, toPublicAccount } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Account from "@/models/Account";
import { findSupabaseAccounts, readWithSupabaseFallback, upsertSupabaseAccount, writeToBoth } from "@/lib/supabase-data";

export const runtime = "nodejs";

function validateAccount(input: { displayName: unknown; phone: unknown; email: unknown; password: unknown }) {
  const displayName = String(input.displayName || "").trim();
  const phone = String(input.phone || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  if (displayName.length < 2 || displayName.length > 80) return { error: "Tên tài khoản cần từ 2 đến 80 ký tự" };
  if (!/^\+?[0-9\s()-]{8,20}$/.test(phone)) return { error: "Số điện thoại chưa hợp lệ" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email chưa hợp lệ" };
  if (password.length < 8) return { error: "Mật khẩu cần ít nhất 8 ký tự" };
  return { displayName, phone, email, password };
}

export async function GET() {
  const requester = await getAuthenticatedAccount();
  if (!requester) return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
  if (requester.role !== "admin") return NextResponse.json({ error: "Bạn không có quyền quản lý tài khoản" }, { status: 403 });
  const accounts = await readWithSupabaseFallback(
    "account list",
    () => findSupabaseAccounts(),
    async () => {
      await connectToDatabase();
      return Account.find().sort({ createdAt: 1 }).lean();
    },
  );
  return NextResponse.json({ accounts: accounts.map(toPublicAccount) });
}

export async function POST(request: Request) {
  const requester = await getAuthenticatedAccount();
  if (!requester) return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
  if (requester.role !== "admin") return NextResponse.json({ error: "Bạn không có quyền quản lý tài khoản" }, { status: 403 });
  try {
    const data = validateAccount(await request.json());
    if ("error" in data) return NextResponse.json({ error: data.error }, { status: 400 });
    const credentials = await hashPassword(data.password);
    const accountRecord = {
      _id: new mongoose.Types.ObjectId().toString(),
      displayName: data.displayName,
      phone: data.phone,
      email: data.email,
      passwordHash: credentials.hash,
      passwordSalt: credentials.salt,
      role: "user" as const,
      updatedAt: new Date(),
    };
    const saved = await writeToBoth(
      "account create",
      () => upsertSupabaseAccount(accountRecord),
      async () => {
        await connectToDatabase();
        return Account.create(accountRecord);
      },
    );
    const account = saved.supabaseResult ?? saved.mongoResult;
    if (!account) throw new Error("Account was not returned after saving");
    return NextResponse.json({ account: toPublicAccount(account), storage: saved.storage }, { status: 201 });
  } catch (error) {
    if ((error && typeof error === "object" && "code" in error && error.code === 11000)
      || (error instanceof Error && /"code"\s*:\s*"23505"/.test(error.message))) {
      return NextResponse.json({ error: "Số điện thoại hoặc email đã được sử dụng" }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Không thể tạo tài khoản";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
