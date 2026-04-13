/**
 * @agentcenter/database - Profile Operations
 *
 * Ensure an agent has a Profile. Create if missing, update if identity changed.
 */

import { prisma } from "../client";
import { ProfileKind } from "@agentcenter/utils";

const PROFILE_USERNAME_MAX_LEN = 64;

function normalizeAvatarUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.hostname.endsWith("r2.cloudflarestorage.com")) {
      const segments = url.pathname.replace(/^\//, "").split("/");
      const storageKey = segments.slice(1).join("/");
      if (storageKey) return `/api/storage/${storageKey}?public=1`;
    }
  } catch {
    // Not a valid URL
  }
  return raw;
}

function normalizeUsername(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim().toLowerCase().replace(/\s+/g, "_").slice(0, PROFILE_USERNAME_MAX_LEN);
  return t || null;
}

export async function getOrCreateAgentProfileId(agentId: string): Promise<string> {
  const existing = await prisma.profile.findUnique({
    where: { agentId },
    select: { id: true },
  });
  if (existing) return existing.id;

  await ensureAgentProfile(agentId);

  const created = await prisma.profile.findUnique({
    where: { agentId },
    select: { id: true },
  });
  if (!created) throw new Error(`Failed to create profile for agent ${agentId}`);
  return created.id;
}

export async function ensureAgentProfile(agentId: string): Promise<void> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, username: true, avatar: true },
  });
  if (!agent) return;

  const displayName = agent.name?.trim() || "Agent";
  const desiredUsername = normalizeUsername(agent.username);

  const profile = await prisma.profile.findUnique({ where: { agentId: agent.id } });

  if (!profile) {
    let username = desiredUsername;
    if (username) {
      const taken = await prisma.profile.findUnique({ where: { username } });
      if (taken) username = `agent_${agent.id.slice(-8)}`;
    } else {
      username = `agent_${agent.id.slice(-8)}`;
    }
    await prisma.profile.create({
      data: {
        kind: ProfileKind.AGENT,
        displayName,
        username,
        avatarUrl: normalizeAvatarUrl(agent.avatar) ?? undefined,
        agentId: agent.id,
      },
    });
    return;
  }

  const updates: { displayName?: string; username?: string | null; avatarUrl?: string | null } = {};
  if (profile.displayName !== displayName) updates.displayName = displayName;
  const normalizedAvatar = normalizeAvatarUrl(agent.avatar);
  if ((normalizedAvatar ?? null) !== (profile.avatarUrl ?? null))
    updates.avatarUrl = normalizedAvatar ?? null;

  if (desiredUsername !== null && desiredUsername !== profile.username) {
    const taken = await prisma.profile.findUnique({ where: { username: desiredUsername } });
    if (!taken || taken.id === profile.id) {
      updates.username = desiredUsername;
    }
  }

  if (Object.keys(updates).length > 0) {
    await prisma.profile.update({ where: { id: profile.id }, data: updates });
  }
}
