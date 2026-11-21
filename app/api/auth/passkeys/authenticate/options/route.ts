import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { getWebAuthnConfig, requestHasExpectedOrigin, setPasskeyChallenge } from "@/lib/passkeys";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { expectedOrigin, rpID } = getWebAuthnConfig(request);
    if (!requestHasExpectedOrigin(request, expectedOrigin)) {
      return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 403 });
    }
    const options = await generateAuthenticationOptions({
      rpID,
      timeout: 60_000,
      userVerification: "required",
    });
    await setPasskeyChallenge(null, options.challenge, "authenticate");

    return NextResponse.json({ options }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[auth] Passkey authentication options failed", error);
    return NextResponse.json({ error: "Không thể bắt đầu đăng nhập Face ID lúc này" }, { status: 503 });
  }
}
