import { NextResponse } from "next/server";
import { after } from "next/server";
import { bootstrapAdminAndMigrate, rememberAuthenticatedAccount, setSessionCookie, toPublicAccount, verifyPassword } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Account from "@/models/Account";
import { findSupabaseAccountByIdentifier, readWithSupabaseFallback } from "@/lib/supabase-data";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { identifier?: unknown; password?: unknown };
    const identifier = String(body.identifier || "").trim();
    const password = String(body.password || "");
    if (!identifier || !password) return NextResponse.json({ error: "Nhập số điện thoại/email và mật khẩu" }, { status: 400 });
    const normalizedEmail = identifier.toLowerCase();
    const readFromMongo = async () => {
      await bootstrapAdminAndMigrate();
      await connectToDatabase();
      return Account.findOne({ $or: [{ phone: identifier }, { email: normalizedEmail }] }).select("+passwordHash +passwordSalt").lean();
    };
    const account = await readWithSupabaseFallback(
      "login account lookup",
      async () => (await findSupabaseAccountByIdentifier(identifier)) ?? readFromMongo(),
      readFromMongo,
    );
    if (!account || !(await verifyPassword(password, account.passwordSalt, account.passwordHash))) {
      return NextResponse.json({ error: "Thông tin đăng nhập chưa chính xác" }, { status: 401 });
    }
    const publicAccount = toPublicAccount(account);
    await setSessionCookie(publicAccount.id);
    rememberAuthenticatedAccount(publicAccount);
    after(async () => {
      try {
        await bootstrapAdminAndMigrate();
      } catch (error) {
        console.warn("[auth] MongoDB bootstrap or legacy migration failed after Supabase login", error);
      }
    });
    return NextResponse.json({ account: publicAccount }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể đăng nhập";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
