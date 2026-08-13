/**
 * @agentcenter/database - buildbase auth-bridge Profile upsert.
 *
 * Mirrors ensureUserAndProfileForAdmin (admin-user/ensure-user-profile.ts) but keys the local
 * User + public Profile to a VERIFIED buildbase (SaaS) user identity. Idempotent: repeat calls for
 * the same buildbaseUserId reuse the existing Profile — the bridge runs on every sign-in / auto-SSO.
 *
 * SECURITY: the caller MUST pass an identity it has already verified with buildbase (OAuth token
 * exchange, or a validated bb-session-id). This function performs NO authentication — it only
 * materialises the local actor row. It never grants roles; capability is governed downstream by
 * buildbase RBAC (see apps/web/src/server/auth/buildbase-bridge.ts).
 */

import { prisma } from "../client";
import { ProfileKind } from "@agentcenter/utils";

/** Profile.username suffix for buildbase-sourced humans (Profile.username is unique). */
const BUILDBASE_USERNAME_SUFFIX = "_bb";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

function normalizeUsernameBase(email: string, buildbaseUserId: string): string {
  const local = (email.split("@")[0] || "").toLowerCase().replace(/[^a-z0-9_]/g, "_");
  return local || `bb_${buildbaseUserId.slice(-8).toLowerCase()}`;
}

export interface EnsureBuildbaseProfileInput {
  /** buildbase user id (_id / id). Required — the upsert key. */
  buildbaseUserId: string;
  email?: string | null;
  name?: string | null;
}

/**
 * Upsert the local User + public Profile for a buildbase user. Returns { userId, profileId }.
 * Idempotent on repeat calls (keyed by buildbaseUserId), and race-safe against the unique index.
 */
export async function ensureUserAndProfileForBuildbase(
  input: EnsureBuildbaseProfileInput,
): Promise<{ userId: string; profileId: string }> {
  const buildbaseUserId = (input.buildbaseUserId ?? "").trim();
  if (!buildbaseUserId) throw new Error("buildbaseUserId is required");

  // 1) Already bridged? Reuse (idempotent — the common case on every sign-in / auto-SSO).
  const existing = await prisma.profile.findUnique({ where: { buildbaseUserId } });
  if (existing) {
    return { userId: existing.userId ?? "", profileId: existing.id };
  }

  // Buildbase emails are real addresses; admin User emails are "<name>@app.local", so no collision
  // in practice. Fall back to a synthetic address when buildbase omits the email.
  const email =
    (input.email ?? "").trim().toLowerCase() || `${buildbaseUserId.toLowerCase()}@buildbase.local`;
  const displayName = (input.name ?? "").trim() || (input.email ?? "").trim() || "Buildbase User";

  // 2) Get or create the local User (email is unique).
  let user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
  if (!user) {
    try {
      user = await prisma.user.create({ data: { email }, include: { profile: true } });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
      if (!user) throw err;
    }
  }

  // 3) User already has a Profile (e.g. it was an admin first) → attach the buildbase identity to it.
  if (user.profile) {
    if (user.profile.buildbaseUserId === buildbaseUserId) {
      return { userId: user.id, profileId: user.profile.id };
    }
    try {
      const updated = await prisma.profile.update({
        where: { id: user.profile.id },
        data: { buildbaseUserId },
      });
      return { userId: user.id, profileId: updated.id };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // buildbaseUserId already taken by another Profile (concurrent bridge) — reuse that one.
      const byBb = await prisma.profile.findUnique({ where: { buildbaseUserId } });
      if (byBb) return { userId: byBb.userId ?? user.id, profileId: byBb.id };
      throw err;
    }
  }

  // 4) Create a fresh public Profile with a unique username.
  const base = normalizeUsernameBase(email, buildbaseUserId);
  const candidates = [
    `${base}${BUILDBASE_USERNAME_SUFFIX}`,
    `${base}_${buildbaseUserId.slice(-6).toLowerCase()}${BUILDBASE_USERNAME_SUFFIX}`,
    null, // username is nullable — last resort so a clash never blocks sign-in
  ];
  for (const username of candidates) {
    try {
      const profile = await prisma.profile.create({
        data: {
          kind: ProfileKind.HUMAN,
          displayName,
          username,
          userId: user.id,
          buildbaseUserId,
        },
      });
      return { userId: user.id, profileId: profile.id };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Either buildbaseUserId raced (reuse the winner) or the username clashed (try the next one).
      const byBb = await prisma.profile.findUnique({ where: { buildbaseUserId } });
      if (byBb) return { userId: byBb.userId ?? user.id, profileId: byBb.id };
    }
  }
  throw new Error("Failed to create buildbase profile");
}
