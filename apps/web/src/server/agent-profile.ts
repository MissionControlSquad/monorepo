/**
 * Ensure an agent has a Profile (for channels, mentions, etc.). Create if missing,
 * and update displayName / username / avatarUrl when the agent's identity changes.
 * Called from sync_identity and heartbeat.
 */
import { prisma } from "./prisma";

const PROFILE_USERNAME_MAX_LEN = 64;

/**
 * If the value is a raw presigned R2 URL, extract the storage key and return
 * it as a proxy path (`/api/storage/{key}`). Otherwise return the value as-is.
 */
function normalizeAvatarUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.hostname.endsWith("r2.cloudflarestorage.com")) {
      // Path is like "/bucket-name/avatars/uuid-file.png" — strip the leading /bucket/ segment
      const segments = url.pathname.replace(/^\//, "").split("/");
      // First segment is the bucket name, rest is the storage key
      const storageKey = segments.slice(1).join("/");
      if (storageKey) return `/api/storage/${storageKey}?public=1`;
    }
  } catch {
    // Not a valid URL — fall through
  }
  return raw;
}

function normalizeUsername(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim().toLowerCase().replace(/\s+/g, "_").slice(0, PROFILE_USERNAME_MAX_LEN);
  return t || null;
}

/**
 * Ensure the agent has a profile and return its profile ID.
 * Creates the profile if missing. Throws only if the agent doesn't exist.
 */
export async function getOrCreateAgentProfileId(agentId: string): Promise<string> {
  // Fast path: profile already exists
  const existing = await prisma.profile.findUnique({
    where: { agentId },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Slow path: create it
  await ensureAgentProfile(agentId);

  const created = await prisma.profile.findUnique({
    where: { agentId },
    select: { id: true },
  });
  if (!created) {
    throw new Error(`Failed to create profile for agent ${agentId}`);
  }
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

  const profile = await prisma.profile.findUnique({
    where: { agentId: agent.id },
  });

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
        kind: "agent",
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
    await prisma.profile.update({
      where: { id: profile.id },
      data: updates,
    });
  }
}
