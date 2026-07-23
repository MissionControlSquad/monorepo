import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import { generateApiKey, hashApiKey } from "@/server/api-key";
import type { AgentKeyClaim } from "@agentcenter/database";

// One-time agent-key claim ceremony (parity Domain-10 A13 / GAP-5). createKeyClaim mints a durable claim
// token (only its hash stored); claimAgentKey burns it on first use and issues a scoped agent key. A
// leaked claim token can't be replayed (single-use) and never exposes the live agent key until claimed.
// Workspace-scoped.

const DEFAULT_TTL_MS = 7 * 24 * 3_600_000; // 7 days

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Mint a claim. Returns the row plus the ONE-TIME `claimSecret` (shown once, never stored — only its
 * hash is persisted). Ship the secret to the provisioning target; it is redeemed via claimAgentKey.
 */
export async function createKeyClaim(input: {
  workspaceId: string;
  agentId?: string | null;
  label?: string | null;
  ttlMs?: number;
  createdByProfileId?: string | null;
}): Promise<{ claim: AgentKeyClaim; claimSecret: string }> {
  const claimSecret = `clm_${randomBytes(24).toString("hex")}`;
  const claim = await prisma.agentKeyClaim.create({
    data: {
      workspaceId: input.workspaceId,
      agentId: input.agentId ?? null,
      label: input.label ?? null,
      claimSecretHash: sha256(claimSecret),
      expiresAt: new Date(Date.now() + Math.max(60_000, input.ttlMs ?? DEFAULT_TTL_MS)),
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
  return { claim, claimSecret };
}

/**
 * Redeem a claim: verify the presented secret, burn it (compare-and-delete — status→claimed, hash
 * nulled), and issue a scoped agent key. Idempotency is NOT offered: a second attempt with the same
 * secret is rejected (the whole point is single-use). Returns the plaintext agent key ONCE.
 */
export async function claimAgentKey(
  claimId: string,
  presentedSecret: string,
): Promise<{ agentKey: string; agentId: string | null }> {
  const claim = await prisma.agentKeyClaim.findUnique({ where: { id: claimId } });
  if (!claim) badRequest("Claim not found");
  if (claim.status !== "pending" || !claim.claimSecretHash)
    badRequest("Claim already used or revoked");
  if (claim.expiresAt.getTime() <= Date.now()) {
    await prisma.agentKeyClaim.update({ where: { id: claim.id }, data: { status: "expired" } });
    badRequest("Claim expired");
  }
  if (!hashesEqual(claim.claimSecretHash, sha256(presentedSecret)))
    badRequest("Invalid claim secret");

  const { plainKey, hash, prefix } = generateApiKey();

  // Burn the claim atomically: only the transition from pending→claimed with the matching hash wins,
  // so a concurrent double-claim can't both succeed.
  const { count } = await prisma.agentKeyClaim.updateMany({
    where: { id: claim.id, status: "pending", claimSecretHash: claim.claimSecretHash },
    data: { status: "claimed", claimSecretHash: null, claimedAt: new Date() },
  });
  if (count === 0) badRequest("Claim already used");

  // Bind the issued key to the agent, if this claim provisions a specific one.
  if (claim.agentId) {
    await prisma.agent.updateMany({
      where: { id: claim.agentId, workspaceId: claim.workspaceId },
      data: { apiKeyHash: hash, apiKeyPrefix: prefix },
    });
  }
  return { agentKey: plainKey, agentId: claim.agentId };
}

/** Verify an API key hash lookup helper is available (re-export for callers that authenticate the key). */
export { hashApiKey };

/** List claims with the secret hash stripped — a listing must never carry it. */
export async function listKeyClaims(
  workspaceId: string,
): Promise<Omit<AgentKeyClaim, "claimSecretHash">[]> {
  const rows = await prisma.agentKeyClaim.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(({ claimSecretHash: _omit, ...rest }) => rest);
}

export async function revokeKeyClaim(workspaceId: string, id: string): Promise<boolean> {
  const { count } = await prisma.agentKeyClaim.updateMany({
    where: { id, workspaceId, status: "pending" },
    data: { status: "expired", claimSecretHash: null },
  });
  return count > 0;
}
