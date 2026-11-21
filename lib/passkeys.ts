import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import Account, { type PasskeyCredentialRecord } from "@/models/Account";
import PasskeyChallenge, { type PasskeyChallengePurpose } from "@/models/PasskeyChallenge";
import { connectToDatabase } from "@/lib/mongodb";
import {
  consumeSupabasePasskeyChallenge,
  findSupabaseAccountById,
  findSupabaseAccountByIdentifier,
  isSupabaseConfigured,
  readWithSupabaseFallback,
  saveSupabasePasskeyChallenge,
  updateSupabaseAccountPasskeys,
  writeToBoth,
} from "@/lib/supabase-data";
import { invalidateAuthenticatedAccount } from "@/lib/auth";

const PASSKEY_CHALLENGE_COOKIE = "attendance_passkey_challenge";
const PASSKEY_CHALLENGE_SECONDS = 5 * 60;

export type PasskeyAccount = {
  _id: unknown;
  displayName: string;
  phone: string;
  email: string;
  role: string;
  passkeys?: PasskeyCredentialRecord[];
};

type ChallengePayload = {
  accountId: string;
  challenge: string;
  purpose: PasskeyChallengePurpose;
  expiresAt: number;
};

function challengeSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Thiếu AUTH_SESSION_SECRET (cần tối thiểu 32 ký tự)");
  return secret;
}

function signPayload(payload: string) {
  return createHmac("sha256", challengeSecret()).update(payload).digest("base64url");
}

function isChallengePurpose(value: unknown): value is PasskeyChallengePurpose {
  return value === "register" || value === "authenticate";
}

export async function setPasskeyChallenge(accountId: string, challenge: string, purpose: PasskeyChallengePurpose) {
  const expiresAt = new Date(Date.now() + PASSKEY_CHALLENGE_SECONDS * 1000);
  const challengeRecord = { challenge, accountId, purpose, expiresAt };
  if (isSupabaseConfigured()) {
    await saveSupabasePasskeyChallenge(challengeRecord);
  } else {
    await connectToDatabase();
    await PasskeyChallenge.create({ _id: challenge, ...challengeRecord });
  }
  const payload = Buffer.from(JSON.stringify({
    accountId,
    challenge,
    purpose,
    expiresAt: expiresAt.getTime(),
  } satisfies ChallengePayload)).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(PASSKEY_CHALLENGE_COOKIE, `${payload}.${signPayload(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: PASSKEY_CHALLENGE_SECONDS,
  });
}

export async function consumePasskeyChallenge(purpose: PasskeyChallengePurpose) {
  const cookieStore = await cookies();
  const token = cookieStore.get(PASSKEY_CHALLENGE_COOKIE)?.value;
  cookieStore.set(PASSKEY_CHALLENGE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expectedSignature = Buffer.from(signPayload(payload), "base64url");
  const suppliedSignature = Buffer.from(signature, "base64url");
  if (expectedSignature.length !== suppliedSignature.length || !timingSafeEqual(expectedSignature, suppliedSignature)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<ChallengePayload>;
    if (
      typeof value.accountId !== "string"
      || typeof value.challenge !== "string"
      || !isChallengePurpose(value.purpose)
      || value.purpose !== purpose
      || typeof value.expiresAt !== "number"
      || value.expiresAt <= Date.now()
    ) return null;
    const verifiedChallenge: ChallengePayload = {
      accountId: value.accountId,
      challenge: value.challenge,
      purpose: value.purpose,
      expiresAt: value.expiresAt,
    };
    const consumed = isSupabaseConfigured()
      ? (await consumeSupabasePasskeyChallenge({
        challenge: verifiedChallenge.challenge,
        accountId: verifiedChallenge.accountId,
        purpose,
      })).length > 0
      : await consumeMongoPasskeyChallenge(verifiedChallenge);
    return consumed ? verifiedChallenge : null;
  } catch {
    return null;
  }
}

async function consumeMongoPasskeyChallenge(payload: ChallengePayload) {
  await connectToDatabase();
  const consumed = await PasskeyChallenge.findOneAndDelete({
    _id: payload.challenge,
    accountId: payload.accountId,
    purpose: payload.purpose,
    expiresAt: { $gt: new Date() },
  }).lean();
  return Boolean(consumed);
}

export function getWebAuthnConfig(request: Request) {
  const requestUrl = new URL(request.url);
  const configuredOrigin = process.env.WEBAUTHN_ORIGIN?.trim();
  const expectedOrigin = configuredOrigin || requestUrl.origin;
  const originUrl = new URL(expectedOrigin);
  const rpID = (process.env.WEBAUTHN_RP_ID?.trim() || originUrl.hostname).toLowerCase();
  const isLocalhost = originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1";

  if (originUrl.origin !== expectedOrigin || (originUrl.protocol !== "https:" && !isLocalhost)) {
    throw new Error("WebAuthn cần HTTPS hoặc localhost và WEBAUTHN_ORIGIN phải là một origin hợp lệ");
  }
  if (originUrl.hostname !== rpID && !originUrl.hostname.endsWith(`.${rpID}`)) {
    throw new Error("WEBAUTHN_RP_ID không khớp với tên miền của WEBAUTHN_ORIGIN");
  }

  return { expectedOrigin, rpID };
}

export function requestHasExpectedOrigin(request: Request, expectedOrigin: string) {
  const origin = request.headers.get("origin");
  return !origin || origin === expectedOrigin;
}

async function readMongoAccountById(id: string) {
  await connectToDatabase();
  return (await Account.findById(id).lean()) as PasskeyAccount | null;
}

export async function findPasskeyAccountById(id: string) {
  return readWithSupabaseFallback<PasskeyAccount | null>(
    "passkey account lookup",
    async () => (await findSupabaseAccountById(id)) ?? await readMongoAccountById(id),
    () => readMongoAccountById(id),
  );
}

export async function findPasskeyAccountByIdentifier(identifier: string) {
  const normalizedEmail = identifier.toLowerCase();
  const readMongo = async () => {
    await connectToDatabase();
    return (await Account.findOne({ $or: [{ phone: identifier }, { email: normalizedEmail }] }).lean()) as PasskeyAccount | null;
  };
  return readWithSupabaseFallback<PasskeyAccount | null>(
    "passkey login account lookup",
    async () => (await findSupabaseAccountByIdentifier(identifier)) ?? await readMongo(),
    readMongo,
  );
}

export async function savePasskeyCredentials(accountId: string, passkeys: PasskeyCredentialRecord[]) {
  const saved = await writeToBoth(
    "passkey account update",
    () => updateSupabaseAccountPasskeys(accountId, passkeys),
    async () => {
      await connectToDatabase();
      return Account.findByIdAndUpdate(accountId, { $set: { passkeys, updatedAt: new Date() } }, { returnDocument: "after" }).lean();
    },
  );
  if (!(saved.supabaseResult?.length || saved.mongoResult)) {
    throw new Error("Không tìm thấy tài khoản để lưu passkey");
  }
  invalidateAuthenticatedAccount(accountId);
}
