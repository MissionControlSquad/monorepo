import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { hash, compare } from "bcryptjs";
import { env } from "./env";
import { getAdminUserSessionsRevokedAt, revokeAllAdminUserSessions } from "@agentcenter/database";

const BCRYPT_ROUNDS = 12;
const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds
export const COOKIE_NAME = "mc_session";

function getSecret() {
  return new TextEncoder().encode(env.AUTH_SECRET);
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

/** Token payload. profileId is the current actor for channels/messages/createdBy; userId is not needed there. */
export interface SessionPayload {
  sub: string;
  username: string;
  profileId?: string;
  jti?: string;
  iat?: number;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const jti = crypto.randomUUID();
  return new SignJWT({ ...payload, jti } as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const session = payload as unknown as SessionPayload;

    // Check if sessions have been revoked for this user
    if (session.sub && session.iat) {
      const admin = await getAdminUserSessionsRevokedAt(session.sub);
      if (admin?.sessionsRevokedAt) {
        const revokedAtSec = Math.floor(admin.sessionsRevokedAt.getTime() / 1000);
        if (session.iat < revokedAtSec) {
          return null; // Token was issued before revocation
        }
      }
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Revoke all sessions for a specific admin user.
 * All tokens issued before this timestamp will be rejected.
 */
export async function revokeAllSessions(adminUserId: string): Promise<void> {
  await revokeAllAdminUserSessions(adminUserId);
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DURATION,
  };
}
