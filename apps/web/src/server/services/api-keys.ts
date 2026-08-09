/**
 * API keys — CLI / programmatic access (Epic #12). Workspace-scoped personal access tokens. The
 * plaintext is returned exactly once at mint; only keyHash + keyPrefix are stored. Revoke tombstones.
 * Ports Paperclip `board_api_keys` + `board-auth`. Reuses the existing `server/api-key` util.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import { generateApiKey, hashApiKey } from "@/server/api-key";
import { isApiKeyActive } from "@agentcenter/utils";
import type { ApiKey } from "@agentcenter/database";

// isApiKeyActive + redactKey are shared pure helpers in @agentcenter/utils (web/desktop/mobile).
export { isApiKeyActive, redactKey } from "@agentcenter/utils";

/** An ApiKey with the secret hash removed — the only shape ever returned to clients. */
export type SafeApiKey = Omit<ApiKey, "keyHash">;

function stripHash(key: ApiKey): SafeApiKey {
  const { keyHash: _keyHash, ...safe } = key;
  void _keyHash;
  return safe;
}

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

export async function mintApiKey(args: {
  workspaceId: string;
  name: string;
  expiresAt?: Date | null;
  createdByProfileId?: string | null;
}): Promise<{ apiKey: SafeApiKey; plainKey: string }> {
  if (!args.name.trim()) badRequest("name is required");
  const { plainKey, hash, prefix } = generateApiKey();
  const created = await prisma.apiKey.create({
    data: {
      workspaceId: args.workspaceId,
      name: args.name.trim(),
      keyHash: hash,
      keyPrefix: prefix,
      expiresAt: args.expiresAt ?? null,
      createdByProfileId: args.createdByProfileId ?? null,
    },
  });
  // plainKey surfaced here once — never persisted, never returned again.
  return { apiKey: stripHash(created), plainKey };
}

export async function listApiKeys(workspaceId: string): Promise<SafeApiKey[]> {
  const keys = await prisma.apiKey.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
  return keys.map(stripHash);
}

/** Revoke (tombstone). Idempotent — re-revoking keeps the original revokedAt. */
export async function revokeApiKey(workspaceId: string, id: string): Promise<SafeApiKey> {
  const existing = await prisma.apiKey.findFirst({ where: { workspaceId, id } });
  if (!existing) badRequest("API key not found");
  if (existing.revokedAt) return stripHash(existing);
  const updated = await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  return stripHash(updated);
}

/**
 * Resolve a plaintext key to its active workspace binding and stamp lastUsedAt. Returns null for an
 * unknown, revoked, or expired key. NOTE: not yet wired into the request auth middleware (spec D4).
 */
export async function verifyApiKey(
  plainKey: string,
  now: Date = new Date(),
): Promise<{ workspaceId: string; apiKeyId: string; createdByProfileId: string | null } | null> {
  if (!plainKey) return null;
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(plainKey) } });
  if (!key || !isApiKeyActive(key, now)) return null;
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: now } });
  return {
    workspaceId: key.workspaceId,
    apiKeyId: key.id,
    createdByProfileId: key.createdByProfileId,
  };
}
