import { NextResponse } from "next/server";
import { hashPassword, getAuthenticatedAccount, toPublicAccount } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Account from "@/models/Account";

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
  await connectToDatabase();
  const accounts = await Account.find().sort({ createdAt: 1 }).lean();
  return NextResponse.json({ accounts: accounts.map(toPublicAccount) });
}

export async function POST(request: Request) {
  const requester = await getAuthenticatedAccount();
  if (!requester) return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
  if (requester.role !== "admin") return NextResponse.json({ error: "Bạn không có quyền quản lý tài khoản" }, { status: 403 });
  try {
    const data = validateAccount(await request.json());
    if ("error" in data) return NextResponse.json({ error: data.error }, { status: 400 });
    await connectToDatabase();
    const credentials = await hashPassword(data.password);
    const account = await Account.create({
      displayName: data.displayName,
      phone: data.phone,
      email: data.email,
      passwordHash: credentials.hash,
      passwordSalt: credentials.salt,
      role: "user",
    });
    return NextResponse.json({ account: toPublicAccount(account) }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      return NextResponse.json({ error: "Số điện thoại hoặc email đã được sử dụng" }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Không thể tạo tài khoản";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
