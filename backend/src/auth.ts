// ===========================================================================
//  auth.ts — local username + password login.
//
//  The original BiteN Go build signed in through a hosted OAuth portal. That
//  is gone: this version owns its accounts, so it runs entirely on your own
//  computer with nothing but PostgreSQL.
//
//  * passwords     Argon2id with a per-account salt; legacy scrypt hashes are
//                  verified and upgraded on successful login
//  * sessions      a signed JWT the browser keeps in localStorage and sends
//                  as  Authorization: Bearer <token>
//  * rate limiting a small in-process counter per IP on /auth/login
// ===========================================================================

import { scryptSync, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env.js";

const KEY_LENGTH = 64;
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;
const ARGON2_HASH =
  /^\$argon2id\$v=19\$m=19456,p=1,t=2\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/;
const SCRYPT_HASH = /^scrypt:([a-f\d]{32}):([a-f\d]{128})$/i;

// --- passwords -------------------------------------------------------------

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (!storedHash) return false;
  if (ARGON2_HASH.test(storedHash))
    return argon2.verify(storedHash, password);
  const legacyHash = SCRYPT_HASH.exec(storedHash);
  if (!legacyHash) return false;
  const [, salt, key] = legacyHash;
  const expected = Buffer.from(key, "hex");
  const actual = scryptSync(password, salt, KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Whether a stored hash is structurally valid for either supported format. */
export function isUsableHash(storedHash: string | null | undefined) {
  return typeof storedHash === "string" &&
    (ARGON2_HASH.test(storedHash) || SCRYPT_HASH.test(storedHash));
}

export function isLegacyPasswordHash(storedHash: string | null | undefined) {
  return typeof storedHash === "string" && SCRYPT_HASH.test(storedHash);
}

// --- session tokens --------------------------------------------------------

const secretKey = new TextEncoder().encode(ENV.jwtSecret);

export type SessionClaims = {
  sub: string;
  uid: number;
  role: string;
  username: string | null;
};

export async function createSessionToken(claims: SessionClaims) {
  return new SignJWT({
    uid: claims.uid,
    role: claims.role,
    username: claims.username,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer("busflow")
    .setExpirationTime(`${ENV.jwtExpireMinutes}m`)
    .sign(secretKey);
}

export async function readSessionToken(
  token: string,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: "busflow",
    });
    if (typeof payload.uid !== "number") return null;
    return {
      sub: String(payload.sub ?? ""),
      uid: payload.uid,
      role: String(payload.role ?? "user"),
      username: (payload.username as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/** Pulls the token out of the Authorization header (or an ?access_token query). */
export function extractToken(
  headerValue: string | undefined,
  queryValue?: unknown,
) {
  if (headerValue?.toLowerCase().startsWith("bearer "))
    return headerValue.slice(7).trim();
  if (typeof queryValue === "string" && queryValue.trim())
    return queryValue.trim();
  return null;
}

// --- brute-force protection ------------------------------------------------

const attempts = new Map<string, { count: number; resetAt: number }>();

/** Returns false when this client has spent its login attempts for the window. */
export function consumeLoginAttempt(clientKey: string) {
  const now = Date.now();
  const windowMs = ENV.loginRateWindowSeconds * 1000;
  const entry = attempts.get(clientKey);

  if (!entry || entry.resetAt <= now) {
    attempts.set(clientKey, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= ENV.loginRateLimit) return false;
  entry.count += 1;
  return true;
}

export function clearLoginAttempts(clientKey: string) {
  attempts.delete(clientKey);
}
