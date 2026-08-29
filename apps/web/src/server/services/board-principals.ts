/**
 * Board principals (Paperclip board-authz + board API keys). A board PRINCIPAL is a first-class board
 * identity that can ACT in the boardroom — distinct from a human operator. It authenticates with its
 * own board API key, minted + hashed by the EXISTING ApiKey scheme (SHA-256 at rest); no new token
 * scheme is invented. What it may do is decided by board-authz (`canBoardPrincipalAct`, pure logic in
 * @agentcenter/utils). Workspace-scoped (D5). Revoke tombstones the principal AND revokes its key.
 */
import { prisma } from "@/server/prisma";
import { hashApiKey } from "@/server/api-key";
import {
  BOARD_PRINCIPAL_ROLES,
  canBoardPrincipalAct,
  isApiKeyActive,
  normalizeBoardRole,
} from "@agentcenter/utils";
import type { BoardAction } from "@agentcenter/utils";
import type { BoardMessage, BoardPrincipal } from "@agentcenter/database";
import { mintApiKey, revokeApiKey } from "./api-keys";
import { sendBoardMessage } from "./boardroom";
import type { BoardRelay } from "./boardroom";
import { badRequest } from "./service-errors";

export type { BoardPrincipal };

function assertValidRole(role: string): void {
  if (!(BOARD_PRINCIPAL_ROLES as string[]).includes(role)) {
    badRequest(`role must be one of: ${BOARD_PRINCIPAL_ROLES.join(", ")}`);
  }
}

/**
 * Create a board principal and mint its board API key. The plaintext key is returned exactly ONCE
 * here (only the SHA-256 hash is stored, via the shared ApiKey path). The linked key is named
 * `board:<name>` so it is recognizable in the API-keys surface.
 */
export async function createBoardPrincipal(input: {
  workspaceId: string;
  name: string;
  role?: string | null;
  createdByProfileId?: string | null;
}): Promise<{ principal: BoardPrincipal; plainKey: string; keyPrefix: string }> {
  const name = input.name?.trim();
  if (!name) badRequest("name is required");
  const role = (input.role ?? "member").trim();
  assertValidRole(role);

  const { apiKey, plainKey } = await mintApiKey({
    workspaceId: input.workspaceId,
    name: `board:${name}`,
    createdByProfileId: input.createdByProfileId ?? null,
  });

  const principal = await prisma.boardPrincipal.create({
    data: {
      workspaceId: input.workspaceId,
      name,
      role,
      apiKeyId: apiKey.id,
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
  return { principal, plainKey, keyPrefix: apiKey.keyPrefix };
}

export function listBoardPrincipals(workspaceId: string): Promise<BoardPrincipal[]> {
  return prisma.boardPrincipal.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
}

/** The display prefix of a principal's key (for the UI). Never returns the secret. */
export async function boardPrincipalKeyPrefix(principal: BoardPrincipal): Promise<string | null> {
  const key = await prisma.apiKey.findUnique({
    where: { id: principal.apiKeyId },
    select: { keyPrefix: true },
  });
  return key?.keyPrefix ?? null;
}

async function findScoped(workspaceId: string, id: string): Promise<BoardPrincipal> {
  const principal = await prisma.boardPrincipal.findFirst({ where: { id, workspaceId } });
  if (!principal) badRequest("board principal not found");
  return principal as BoardPrincipal;
}

/** Revoke a board principal (tombstone) and revoke its board API key. Idempotent. */
export async function revokeBoardPrincipal(
  workspaceId: string,
  id: string,
): Promise<BoardPrincipal> {
  const principal = await findScoped(workspaceId, id);
  // Always revoke the key (idempotent), then tombstone the principal if not already.
  await revokeApiKey(workspaceId, principal.apiKeyId).catch(() => undefined);
  if (principal.revokedAt) return principal;
  return prisma.boardPrincipal.update({
    where: { id: principal.id },
    data: { revokedAt: new Date() },
  });
}

/**
 * Resolve a plaintext board key to its (active, un-revoked) principal. Returns null for an unknown,
 * revoked-key, or revoked-principal token. NOTE: not yet wired into request auth middleware (deferred,
 * spec D4) — it is the testable core a future board API gateway calls.
 */
export async function authenticateBoardPrincipal(
  plainKey: string,
  now: Date = new Date(),
): Promise<BoardPrincipal | null> {
  if (!plainKey) return null;
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(plainKey) } });
  if (!key || !isApiKeyActive(key, now)) return null;
  const principal = await prisma.boardPrincipal.findFirst({
    where: { apiKeyId: key.id, workspaceId: key.workspaceId, revokedAt: null },
  });
  return principal ?? null;
}

/**
 * Post a boardroom turn AS a board principal — an attributable board action. Board-authz gates it
 * (a principal whose role lacks `post_message`, e.g. an observer, is refused with a readable reason).
 * The persisted user turn carries `boardPrincipalId` for attribution.
 */
export async function postBoardMessageAsPrincipal(
  input: { workspaceId: string; principalId: string; body: string },
  relay?: BoardRelay,
): Promise<{ userMessage: BoardMessage; assistantMessage: BoardMessage }> {
  const principal = await findScoped(input.workspaceId, input.principalId);
  if (principal.revokedAt) badRequest("board principal is revoked");
  if (!input.body.trim()) badRequest("body is required");
  const action: BoardAction = "post_message";
  if (!canBoardPrincipalAct(principal.role, action)) {
    badRequest(
      `board principal '${principal.name}' (${normalizeBoardRole(principal.role)}) is not permitted to post messages`,
    );
  }
  return sendBoardMessage(
    {
      workspaceId: input.workspaceId,
      body: input.body,
      authorId: null,
      boardPrincipalId: principal.id,
    },
    relay,
  );
}
