import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { findPasskeyAccountByIdentifier, getWebAuthnConfig, requestHasExpectedOrigin, setPasskeyChallenge } from "@/lib/passkeys";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { expectedOrigin, rpID } = getWebAuthnConfig(request);
    if (!requestHasExpectedOrigin(request, expectedOrigin)) {
      return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 403 });
    }
    const body = await request.json() as { identifier?: unknown };
    const identifier = String(body.identifier || "").trim();
    if (!identifier) return NextResponse.json({ error: "Nhập số điện thoại hoặc email trước" }, { status: 400 });

    const account = await findPasskeyAccountByIdentifier(identifier);
    const passkeys = account?.passkeys ?? [];
    if (!account || passkeys.length === 0) {
      return NextResponse.json({ error: "Tài khoản này chưa đăng ký Face ID trên thiết bị nào" }, { status: 404 });
    }

    const accountId = String(account._id);
    const options = await generateAuthenticationOptions({
      rpID,
      timeout: 60_000,
      userVerification: "required",
      allowCredentials: passkeys.map((credential) => ({
        id: credential.id,
        transports: credential.transports,
      })),
    });
    await setPasskeyChallenge(accountId, options.challenge, "authenticate");

    return NextResponse.json({ options }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[auth] Passkey authentication options failed", error);
    return NextResponse.json({ error: "Không thể bắt đầu đăng nhập Face ID lúc này" }, { status: 503 });
  }
}
