import { generateRegistrationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { getAuthenticatedAccount } from "@/lib/auth";
import { findPasskeyAccountById, getWebAuthnConfig, requestHasExpectedOrigin, setPasskeyChallenge } from "@/lib/passkeys";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const currentAccount = await getAuthenticatedAccount();
    if (!currentAccount) return NextResponse.json({ error: "Vui lòng đăng nhập trước khi bật Face ID" }, { status: 401 });

    const { expectedOrigin, rpID } = getWebAuthnConfig(request);
    if (!requestHasExpectedOrigin(request, expectedOrigin)) {
      return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 403 });
    }
    const accountId = String(currentAccount._id);
    const account = await findPasskeyAccountById(accountId);
    if (!account) return NextResponse.json({ error: "Không tìm thấy tài khoản" }, { status: 404 });

    const existingPasskeys = account.passkeys ?? [];
    const options = await generateRegistrationOptions({
      rpName: "Chốt Công",
      rpID,
      userID: Buffer.from(accountId, "utf8"),
      userName: account.phone,
      userDisplayName: account.displayName,
      attestationType: "none",
      timeout: 60_000,
      excludeCredentials: existingPasskeys.map((credential) => ({
        id: credential.id,
        transports: credential.transports,
      })),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      preferredAuthenticatorType: "localDevice",
    });
    await setPasskeyChallenge(accountId, options.challenge, "register");

    return NextResponse.json({ options }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[auth] Passkey registration options failed", error);
    return NextResponse.json({ error: "Không thể bật Face ID lúc này" }, { status: 503 });
  }
}
