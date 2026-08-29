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
import { presignTaskAttachment, confirmTaskAttachment } from "@/server/services/task-attachments";
import { resolveEffectiveMemoryProvider } from "@/server/services/agent-memory";
import { resolveMemoryAdapter, type MemoryScope } from "@/server/services/memory-adapter";

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
    data: {
      taskId: run.taskId,
      fromProfileId,
      content: trimmed.slice(0, MAX_BRIDGE_MESSAGE),
      // Parity §3.12 — attribute the comment to the posting run.
      createdByRunId: run.runId,
    },
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

const MAX_MEMORY_NOTE = 8_000;

/**
 * Resolve the memory adapter a run may use, or null. Least-privilege: the scope is ALWAYS the run's own
 * workspace + agent (from the verified token, never client input), so an in-run agent can only ever
 * touch its OWN memory. A run with no agent, or whose effective provider stores nothing control-plane-
 * side (`none`/`markdown`), gets null - the tool is unavailable for it.
 */
async function resolveRunMemory(
  run: VerifiedRun,
): Promise<{ adapter: ReturnType<typeof resolveMemoryAdapter>; scope: MemoryScope } | null> {
  if (!run.agentId) return null;
  const agent = await prisma.agent.findFirst({
    where: { id: run.agentId, workspaceId: run.workspaceId },
    select: { memoryProvider: true },
  });
  if (!agent) return null;
  const provider = await resolveEffectiveMemoryProvider(run.workspaceId, agent.memoryProvider);
  const adapter = resolveMemoryAdapter(provider);
  if (!adapter) return null;
  return { adapter, scope: { workspaceId: run.workspaceId, agentId: run.agentId } };
}

/**
 * memory.note - the in-run agent records a memory entry to its OWN store, stamped with run/agent
 * provenance. Returns the new entry's id, or null when memory is unavailable for the run or the note
 * is empty. Cost rolls into the run (attributionMode `included_in_run`).
 */
export async function bridgeMemoryNote(
  run: VerifiedRun,
  content: string,
): Promise<{ id: string } | null> {
  const trimmed = content?.trim();
  if (!trimmed) return null;
  const mem = await resolveRunMemory(run);
  if (!mem?.adapter) return null;
  const entry = await mem.adapter.append(mem.scope, trimmed.slice(0, MAX_MEMORY_NOTE), {
    taskId: run.taskId,
    runId: run.runId,
    sourceKind: "run",
    sourceRefId: run.runId,
  });
  return { id: entry.id };
}

/**
 * memory.search - the in-run agent recalls from its OWN store (ILIKE substring recall). Empty query
 * returns recent entries. Returns null when memory is unavailable for the run.
 */
export async function bridgeMemorySearch(
  run: VerifiedRun,
  query: string,
  limit?: number,
): Promise<Array<{ id: string; content: string; createdAt: string }> | null> {
  const mem = await resolveRunMemory(run);
  if (!mem?.adapter) return null;
  const rows = await mem.adapter.search(mem.scope, query ?? "", limit);
  return rows.map((r) => ({ id: r.id, content: r.content, createdAt: r.createdAt.toISOString() }));
}

/**
 * memory.forget - the in-run agent deletes one entry from its OWN store. Scope-bound, so an id owned by
 * another agent is a no-op (returns false). Returns null when memory is unavailable for the run.
 */
export async function bridgeMemoryForget(
  run: VerifiedRun,
  memoryId: string,
): Promise<boolean | null> {
  if (!memoryId?.trim()) return null;
  const mem = await resolveRunMemory(run);
  if (!mem?.adapter) return null;
  return mem.adapter.forget(mem.scope, memoryId.trim());
}

/**
 * memory.correct — the in-run agent supersedes one of its OWN prior entries with corrected content,
 * preserving the original provenance. Scope-bound (an id owned by another agent, or already corrected,
 * is a no-op → null-id result). Returns the new entry's id, or null when memory is unavailable / the
 * correction couldn't be applied. Cost rolls into the run (`included_in_run`).
 */
export async function bridgeMemoryCorrect(
  run: VerifiedRun,
  memoryId: string,
  content: string,
): Promise<{ id: string } | null> {
  const id = memoryId?.trim();
  const trimmed = content?.trim();
  if (!id || !trimmed) return null;
  const mem = await resolveRunMemory(run);
  if (!mem?.adapter?.correct) return null;
  const entry = await mem.adapter.correct(mem.scope, id, trimmed.slice(0, MAX_MEMORY_NOTE), {
    taskId: run.taskId,
    runId: run.runId,
    sourceKind: "run",
    sourceRefId: run.runId,
  });
  return entry ? { id: entry.id } : null;
}

/**
 * memory.list — the in-run agent enumerates its OWN live memory (newest-first, paginated). Returns null
 * when memory is unavailable for the run; otherwise the page plus the next offset for the caller to
 * continue from (null when the page is the last).
 */
export async function bridgeMemoryList(
  run: VerifiedRun,
  opts?: { limit?: number; offset?: number },
): Promise<{
  results: Array<{ id: string; content: string; createdAt: string }>;
  nextOffset: number | null;
} | null> {
  const mem = await resolveRunMemory(run);
  if (!mem?.adapter?.list) return null;
  const page = await mem.adapter.list(mem.scope, opts);
  return {
    results: page.items.map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    })),
    nextOffset: page.nextOffset,
  };
}

/**
 * memory.record_upsert — the in-run agent idempotently upserts a KEYED record into its OWN store.
 * Re-upserting the same key updates the same row rather than appending a duplicate. Returns the entry's
 * id + whether it was newly created, or null when memory is unavailable / the input is empty. Cost rolls
 * into the run.
 */
export async function bridgeMemoryRecordUpsert(
  run: VerifiedRun,
  key: string,
  content: string,
): Promise<{ id: string; created: boolean } | null> {
  const k = key?.trim();
  const trimmed = content?.trim();
  if (!k || !trimmed) return null;
  const mem = await resolveRunMemory(run);
  if (!mem?.adapter?.upsertRecord) return null;
  const res = await mem.adapter.upsertRecord(mem.scope, k, trimmed.slice(0, MAX_MEMORY_NOTE), {
    taskId: run.taskId,
    runId: run.runId,
    sourceKind: "run",
    sourceRefId: run.runId,
  });
  return res ? { id: res.entry.id, created: res.created } : null;
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
