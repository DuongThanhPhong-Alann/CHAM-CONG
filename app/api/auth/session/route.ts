import { NextResponse } from "next/server";
import { getAuthenticatedAccount } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const account = await getAuthenticatedAccount();
    return NextResponse.json({ account: account?.public ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể khởi tạo đăng nhập";
    return NextResponse.json({ error: message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
