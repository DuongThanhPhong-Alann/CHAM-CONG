import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { getAuthenticatedAccount } from "@/lib/auth";
import { consumePasskeyChallenge, findPasskeyAccountById, getWebAuthnConfig, requestHasExpectedOrigin, savePasskeyCredentials } from "@/lib/passkeys";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const currentAccount = await getAuthenticatedAccount();
    if (!currentAccount) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn" }, { status: 401 });

    const { expectedOrigin, rpID } = getWebAuthnConfig(request);
    if (!requestHasExpectedOrigin(request, expectedOrigin)) {
      return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 403 });
    }
    const challenge = await consumePasskeyChallenge("register");
    if (!challenge || challenge.accountId !== String(currentAccount._id)) {
      return NextResponse.json({ error: "Yêu cầu Face ID đã hết hạn. Hãy thử lại." }, { status: 400 });
    }

    const response = await request.json() as RegistrationResponseJSON;
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Không xác minh được Face ID" }, { status: 400 });
    }

    const account = await findPasskeyAccountById(challenge.accountId);
    if (!account) return NextResponse.json({ error: "Không tìm thấy tài khoản" }, { status: 404 });
    const { credential } = verification.registrationInfo;
    const existingPasskeys = account.passkeys ?? [];
    if (existingPasskeys.some((item) => item.id === credential.id)) {
      return NextResponse.json({ error: "Thiết bị này đã được đăng ký Face ID" }, { status: 409 });
    }

    await savePasskeyCredentials(challenge.accountId, [
      ...existingPasskeys,
      {
        id: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        transports: response.response.transports ?? [],
      },
    ]);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[auth] Passkey registration verification failed", error);
    return NextResponse.json({ error: "Không thể hoàn tất đăng ký Face ID" }, { status: 400 });
  }
}
