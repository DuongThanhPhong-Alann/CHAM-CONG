import { NextResponse } from "next/server";
import { bootstrapAdminAndMigrate, setSessionCookie, toPublicAccount, verifyPassword } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Account from "@/models/Account";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await bootstrapAdminAndMigrate();
    const body = await request.json() as { identifier?: unknown; password?: unknown };
    const identifier = String(body.identifier || "").trim();
    const password = String(body.password || "");
    if (!identifier || !password) return NextResponse.json({ error: "Nhập số điện thoại/email và mật khẩu" }, { status: 400 });
    await connectToDatabase();
    const normalizedEmail = identifier.toLowerCase();
    const account = await Account.findOne({ $or: [{ phone: identifier }, { email: normalizedEmail }] }).select("+passwordHash +passwordSalt");
    if (!account || !(await verifyPassword(password, account.passwordSalt, account.passwordHash))) {
      return NextResponse.json({ error: "Thông tin đăng nhập chưa chính xác" }, { status: 401 });
    }
    await setSessionCookie(String(account._id));
    return NextResponse.json({ account: toPublicAccount(account) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể đăng nhập";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
