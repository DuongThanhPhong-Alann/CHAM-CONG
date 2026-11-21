import { verifyAuthenticationResponse, type AuthenticationResponseJSON, type WebAuthnCredential } from "@simplewebauthn/server";
import { after, NextResponse } from "next/server";
import { bootstrapAdminAndMigrate, rememberAuthenticatedAccount, setSessionCookie, toPublicAccount } from "@/lib/auth";
import { consumePasskeyChallenge, findPasskeyAccountByCredentialId, findPasskeyAccountById, getWebAuthnConfig, requestHasExpectedOrigin, savePasskeyCredentials } from "@/lib/passkeys";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { expectedOrigin, rpID } = getWebAuthnConfig(request);
    if (!requestHasExpectedOrigin(request, expectedOrigin)) {
      return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 403 });
    }
    const challenge = await consumePasskeyChallenge("authenticate");
    if (!challenge) return NextResponse.json({ error: "Yêu cầu Face ID đã hết hạn. Hãy thử lại." }, { status: 400 });

    const response = await request.json() as AuthenticationResponseJSON;
    const userHandle = response.response.userHandle
      ? Buffer.from(response.response.userHandle, "base64url").toString("utf8")
      : "";
    let account = userHandle ? await findPasskeyAccountById(userHandle) : null;
    if (!account?.passkeys?.some((credential) => credential.id === response.id)) {
      account = await findPasskeyAccountByCredentialId(response.id);
    }
    const storedCredential = account?.passkeys?.find((credential) => credential.id === response.id);
    if (!account || !storedCredential) {
      return NextResponse.json({ error: "Không tìm thấy thông tin Face ID cho tài khoản" }, { status: 401 });
    }

    const credential: WebAuthnCredential = {
      id: storedCredential.id,
      publicKey: Uint8Array.from(Buffer.from(storedCredential.publicKey, "base64url")),
      counter: storedCredential.counter,
      transports: storedCredential.transports,
    };
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential,
      requireUserVerification: true,
    });
    if (!verification.verified) {
      return NextResponse.json({ error: "Không xác minh được Face ID" }, { status: 401 });
    }

    const updatedPasskeys = (account.passkeys ?? []).map((item) => item.id === credential.id
      ? { ...item, counter: verification.authenticationInfo.newCounter }
      : item);
    await savePasskeyCredentials(String(account._id), updatedPasskeys);

    const publicAccount = toPublicAccount(account);
    await setSessionCookie(publicAccount.id);
    rememberAuthenticatedAccount(publicAccount, true);
    after(async () => {
      try {
        await bootstrapAdminAndMigrate();
      } catch (error) {
        console.warn("[auth] MongoDB bootstrap or legacy migration failed after passkey login", error);
      }
    });
    return NextResponse.json({ account: { ...publicAccount, hasPasskey: true } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[auth] Passkey authentication verification failed", error);
    return NextResponse.json({ error: "Đăng nhập bằng Face ID không thành công" }, { status: 401 });
  }
}
