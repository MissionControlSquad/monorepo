/**
 * Tier D / Phase 3 (Plan 6) — the in-sandbox API bridge. A run gets a short-lived, run-scoped token
 * injected into the sandbox env (AGENTCENTER_RUN_TOKEN + RUN_ID + API_URL). The agent running INSIDE
 * the box can call back to the control plane with it — but ONLY for its own run's task, and ONLY while
 * the run is live. The real workspace credentials never enter the box; the token is hashed at rest and
 * invalidated the moment the run finishes.
 *
 * This is the least-privilege callback channel: a leaked run token can post to one task for the run's
 * lifetime and nothing else.
 */
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/server/prisma";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import {
  presignTaskAttachment,
  confirmTaskAttachment,
} from "@/server/services/task-attachments";

const TOKEN_PREFIX = "rbt_";
const MAX_BRIDGE_MESSAGE = 8_000;

export function hashBridgeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mint a fresh run-scoped token (returns the plaintext to inject + the hash to persist). */
export function mintRunBridgeToken(): { token: string; hash: string } {
  const token = TOKEN_PREFIX + randomBytes(24).toString("hex");
  return { token, hash: hashBridgeToken(token) };
}

export interface VerifiedRun {
  runId: string;
  workspaceId: string;
  taskId: string | null;
  agentId: string | null;
}

/**
 * Verify a bridge token: it must match a run that is still RUNNING. A finished/failed run's token is
 * dead even before the hash is cleared (fail-closed on status). Returns null on any mismatch.
 */
export async function verifyRunBridgeToken(token: string): Promise<VerifiedRun | null> {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const run = await prisma.agentRun.findFirst({
    where: { bridgeTokenHash: hashBridgeToken(token), status: "running" },
    select: { id: true, workspaceId: true, taskId: true, agentId: true },
  });
  if (!run) return null;
  return { runId: run.id, workspaceId: run.workspaceId, taskId: run.taskId, agentId: run.agentId };
}

/** Post a message to the run's task as the run's agent (the only write the bridge permits). */
export async function bridgePostMessage(run: VerifiedRun, content: string): Promise<boolean> {
  if (!run.taskId || !run.agentId) return false;
  const trimmed = content?.trim();
  if (!trimmed) return false;
  const fromProfileId = await getOrCreateAgentProfileId(run.agentId);
  await prisma.message.create({
    data: { taskId: run.taskId, fromProfileId, content: trimmed.slice(0, MAX_BRIDGE_MESSAGE) },
  });
  return true;
}

/**
 * Presign a task-attachment upload for the run's task (the second write the bridge permits). The
 * agent inside the sandbox uses this to attach a produced artifact to ITS task only — the run token
 * scopes both the task and the workspace, so no client-supplied ids are trusted. Returns null if the
 * run has no task. The attachment is uploaded-by the run's agent profile.
 */
export async function bridgePresignAttachment(
  run: VerifiedRun,
  fileName: string,
  contentType: string,
): Promise<{ attachmentId: string; uploadUrl: string } | null> {
  if (!run.taskId) return null;
  const uploadedByProfileId = run.agentId ? await getOrCreateAgentProfileId(run.agentId) : null;
  const { attachment, uploadUrl } = await presignTaskAttachment({
    workspaceId: run.workspaceId,
    taskId: run.taskId,
    fileName,
    contentType,
    uploadedByProfileId,
  });
  return { attachmentId: attachment.id, uploadUrl };
}

/** Confirm a previously-presigned attachment for the run (workspace-scoped to the run). */
export async function bridgeConfirmAttachment(
  run: VerifiedRun,
  attachmentId: string,
  byteSize?: number | null,
): Promise<boolean> {
  if (!attachmentId?.trim()) return false;
  await confirmTaskAttachment(run.workspaceId, attachmentId, byteSize);
  return true;
}

/** Attach a freshly-minted token to a run (call once at run start). */
export async function attachRunBridgeToken(runId: string): Promise<string> {
  const { token, hash } = mintRunBridgeToken();
  await prisma.agentRun.update({ where: { id: runId }, data: { bridgeTokenHash: hash } });
  return token;
}

/** Invalidate a run's bridge token (call when the run finishes). Best-effort. */
export async function clearRunBridgeToken(runId: string): Promise<void> {
  await prisma.agentRun
    .update({ where: { id: runId }, data: { bridgeTokenHash: null } })
    .catch(() => {});
}
