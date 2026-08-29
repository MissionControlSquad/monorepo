/**
 * Tier D: control-plane memory layer (the `db` provider's storage + provenance + operations audit).
 * The binding (agent.memoryProvider override + workspace default) is owned here; this service stores
 * and reads entries for the `db` provider, records an audit row for every memory operation
 * (Domain 4 GAP-A), and captures run residue after a run finishes (GAP-B). For `none`/`markdown`
 * providers nothing is stored control-plane-side (but ops may still be recorded for observability).
 */
import { prisma } from "@/server/prisma";
import type { AgentMemory, MemoryOperation } from "@agentcenter/database";
import {
  resolveMemoryProvider,
  selectMemoriesForInjection,
  type MemoryOpType,
  type MemorySourceKind,
  type MemoryProvider,
} from "@agentcenter/utils";
import { recordCostEvent } from "./cost";

const MAX_INJECT_CHARS = 8_000;
const MAX_CAPTURE_CHARS = 8_000;

/**
 * Record one memory-operation audit row (GAP-A). Best-effort: audit must never break the memory path,
 * so callers may ignore rejections. Every memory code path (capture/query/…) routes through here.
 */
export async function recordMemoryOperation(input: {
  workspaceId: string;
  agentId?: string | null;
  provider: string;
  opType: MemoryOpType;
  projectId?: string | null;
  taskId?: string | null;
  runId?: string | null;
  subjectId?: string | null;
  sourceKind?: MemorySourceKind | null;
  sourceRefId?: string | null;
  success?: boolean;
  error?: string | null;
  latencyMs?: number | null;
  resultCount?: number | null;
  // Usage + cost (Domain 4 GAP-G): tokens an op consumed and its money cost. When a directly-billed
  // op carries costCents with no pre-existing costEventId, a CostEvent is created + linked so memory
  // spend surfaces in the finance ledger. `included_in_run` records the cost for visibility without a
  // new ledger entry (the run already billed it); pass the run's costEventId to link it.
  inputTokens?: number | null;
  embeddingTokens?: number | null;
  outputTokens?: number | null;
  costCents?: number | null;
  costEventId?: string | null;
  attributionMode?: string | null;
}): Promise<MemoryOperation> {
  const costCents = input.costCents ?? null;
  const attributionMode = input.attributionMode ?? (costCents != null ? "billed_directly" : null);
  let costEventId = input.costEventId ?? null;

  // Auto-attribute a directly-billed memory op to the ledger (unless the caller already linked one).
  if (costCents != null && costCents > 0 && !costEventId && attributionMode === "billed_directly") {
    try {
      const event = await recordCostEvent({
        workspaceId: input.workspaceId,
        agentId: input.agentId ?? null,
        model: `memory:${input.opType}`,
        provider: input.provider,
        taskId: input.taskId ?? null,
        projectId: input.projectId ?? null,
        tokensIn: (input.inputTokens ?? 0) + (input.embeddingTokens ?? 0),
        tokensOut: input.outputTokens ?? 0,
        amountCents: costCents,
        billingType: "metered_api",
        source: "agent",
      });
      costEventId = event.id;
    } catch {
      // Ledger write is best-effort — never break the memory audit path over a cost link.
    }
  }

  return prisma.memoryOperation.create({
    data: {
      workspaceId: input.workspaceId,
      agentId: input.agentId ?? null,
      provider: input.provider,
      opType: input.opType,
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      runId: input.runId ?? null,
      subjectId: input.subjectId ?? null,
      sourceKind: input.sourceKind ?? null,
      sourceRefId: input.sourceRefId ?? null,
      success: input.success ?? true,
      error: input.error ?? null,
      latencyMs: input.latencyMs ?? null,
      resultCount: input.resultCount ?? null,
      inputTokens: input.inputTokens ?? null,
      embeddingTokens: input.embeddingTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      costCents,
      costEventId,
      attributionMode,
    },
  });
}

/** Append a memory entry (provenance = sourceTaskId + sourceKind/sourceRefId). */
export async function appendAgentMemory(input: {
  workspaceId: string;
  agentId: string;
  content: string;
  sourceTaskId?: string | null;
  sourceKind?: MemorySourceKind | null;
  sourceRefId?: string | null;
}): Promise<AgentMemory> {
  return prisma.agentMemory.create({
    data: {
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      content: input.content,
      sourceTaskId: input.sourceTaskId ?? null,
      sourceKind: input.sourceKind ?? (input.sourceTaskId ? "run" : null),
      sourceRefId: input.sourceRefId ?? null,
    },
  });
}

/** The most recent memory entries for an agent (newest first). */
export async function readAgentMemory(
  workspaceId: string,
  agentId: string,
  limit = 20,
): Promise<AgentMemory[]> {
  return prisma.agentMemory.findMany({
    // Superseded (corrected) entries are excluded from recall so a corrected fact never resurfaces;
    // both rows are still kept in the table for the audit trail (see correctAgentMemory).
    where: { workspaceId, agentId, supersededById: null },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });
}

/**
 * Assemble the memory text to inject into a task's context for the `db` provider: recent entries,
 * oldest-first, capped. Records a `query` operation (GAP-A) with the hit count. Returns null when
 * there's nothing to inject.
 */
export async function assembleInjectedMemory(
  workspaceId: string,
  agentId: string,
  opContext?: { taskId?: string | null; runId?: string | null },
): Promise<string | null> {
  const start = Date.now();
  // Pull a larger candidate set and RANK it (Domain-4 F17/F18): when a task context is present, its
  // title/description terms bias selection toward relevant memories, not merely the most recent ones.
  const candidates = await readAgentMemory(workspaceId, agentId, 100);
  let queryTerms: string[] | undefined;
  if (opContext?.taskId) {
    const task = await prisma.task.findUnique({
      where: { id: opContext.taskId },
      select: { title: true, description: true },
    });
    if (task)
      queryTerms =
        `${task.title} ${task.description}`.toLowerCase().match(/[a-z0-9]{3,}/g) ?? undefined;
  }
  const rows = selectMemoriesForInjection(candidates, 20, { now: Date.now(), queryTerms });
  await recordMemoryOperation({
    workspaceId,
    agentId,
    provider: "db",
    opType: "query",
    taskId: opContext?.taskId ?? null,
    runId: opContext?.runId ?? null,
    resultCount: rows.length,
    latencyMs: Date.now() - start,
    attributionMode: "included_in_run",
  }).catch(() => {});
  if (rows.length === 0) return null;
  // Emit oldest-first for readability (selection was by relevance; presentation is chronological).
  const text = rows
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((r) => r.content)
    .join("\n\n---\n\n");
  return text.length > MAX_INJECT_CHARS ? text.slice(-MAX_INJECT_CHARS) : text;
}

/** The company-wide default memory provider (GAP-C); "none" when unset. */
export async function getCompanyDefaultMemoryProvider(
  workspaceId: string,
): Promise<MemoryProvider> {
  const row = await prisma.workspaceMemorySetting.findUnique({
    where: { workspaceId },
    select: { defaultProvider: true },
  });
  return resolveMemoryProvider(null, row?.defaultProvider);
}

/** Set the company-wide default memory provider (GAP-C, admin/MEMORY-gated at the edge). */
export async function setCompanyDefaultMemoryProvider(
  workspaceId: string,
  provider: MemoryProvider,
  updatedByProfileId?: string | null,
): Promise<MemoryProvider> {
  await prisma.workspaceMemorySetting.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      defaultProvider: provider,
      updatedByProfileId: updatedByProfileId ?? null,
    },
    update: { defaultProvider: provider, updatedByProfileId: updatedByProfileId ?? null },
  });
  return provider;
}

/**
 * Resolve the effective provider for an agent (override → company default → none), fetching the
 * company default lazily. Used by the pre-run hydrate path and post-run capture.
 */
export async function resolveEffectiveMemoryProvider(
  workspaceId: string | null | undefined,
  agentProvider: string | null | undefined,
): Promise<MemoryProvider> {
  if (agentProvider && resolveMemoryProvider(agentProvider, null) !== "none") {
    return resolveMemoryProvider(agentProvider, null);
  }
  if (!workspaceId) return "none";
  return getCompanyDefaultMemoryProvider(workspaceId);
}

/**
 * Post-run auto-capture hook (GAP-B). After a run finishes, if the agent's effective provider is `db`,
 * persist a memory entry from the run residue and record a `capture` op. For `none`/`markdown` it is a
 * silent no-op (nothing captured, nothing logged). Best-effort — never throws; capturing memory must
 * not fail a run.
 */
export async function captureRunMemory(input: {
  workspaceId: string;
  agentId: string;
  agentProvider: string | null | undefined;
  taskId?: string | null;
  runId?: string | null;
  summary: string;
}): Promise<AgentMemory | null> {
  try {
    const provider = await resolveEffectiveMemoryProvider(input.workspaceId, input.agentProvider);
    if (provider !== "db") return null;
    const content = input.summary.trim();
    if (!content) return null;
    const start = Date.now();
    const entry = await appendAgentMemory({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      content: content.slice(0, MAX_CAPTURE_CHARS),
      sourceTaskId: input.taskId ?? null,
      sourceKind: "run",
      sourceRefId: input.runId ?? null,
    });
    await recordMemoryOperation({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      provider,
      opType: "capture",
      taskId: input.taskId ?? null,
      runId: input.runId ?? null,
      sourceKind: "run",
      sourceRefId: input.runId ?? null,
      resultCount: 1,
      latencyMs: Date.now() - start,
      attributionMode: "included_in_run",
    }).catch(() => {});
    return entry;
  } catch {
    return null; // capture is best-effort
  }
}

/**
 * Search an agent's stored memory (Domain 4 GAP-F) — real recall instead of the crude newest-20 bulk
 * inject. Case-insensitive substring match over content (ILIKE via `contains`), newest first. Records
 * a `query` operation with the hit count. Empty query → recent entries.
 */
export async function searchAgentMemory(
  workspaceId: string,
  agentId: string,
  query: string,
  limit = 20,
): Promise<AgentMemory[]> {
  const start = Date.now();
  const q = query.trim();
  const rows = await prisma.agentMemory.findMany({
    where: {
      workspaceId,
      agentId,
      supersededById: null, // corrected entries never resurface in recall
      ...(q ? { content: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });
  await recordMemoryOperation({
    workspaceId,
    agentId,
    provider: "db",
    opType: "query",
    resultCount: rows.length,
    latencyMs: Date.now() - start,
    sourceKind: "manual_note",
  }).catch(() => {});
  return rows;
}

/**
 * Fetch a single memory entry by id (Domain 4 GAP-F). Workspace + agent scoped so one agent can't
 * read another's memory. Records a `get` operation. Returns null when the id is missing or out of scope.
 */
export async function getAgentMemory(
  workspaceId: string,
  agentId: string,
  memoryId: string,
): Promise<AgentMemory | null> {
  const row = await prisma.agentMemory.findFirst({
    where: { id: memoryId, workspaceId, agentId },
  });
  await recordMemoryOperation({
    workspaceId,
    agentId,
    provider: "db",
    opType: "get",
    subjectId: memoryId,
    resultCount: row ? 1 : 0,
    success: !!row,
  }).catch(() => {});
  return row;
}

/**
 * Forget (delete) a single memory entry (Domain 4 GAP-F). Workspace + agent scoped so one agent can't
 * delete another's memory. Records a `forget` operation. Returns true when a row was removed.
 */
export async function forgetAgentMemory(
  workspaceId: string,
  agentId: string,
  memoryId: string,
): Promise<boolean> {
  const res = await prisma.agentMemory.deleteMany({
    where: { id: memoryId, workspaceId, agentId },
  });
  await recordMemoryOperation({
    workspaceId,
    agentId,
    provider: "db",
    opType: "forget",
    resultCount: res.count,
    success: res.count > 0,
  }).catch(() => {});
  return res.count > 0;
}

/** Provenance to carry onto a corrected/upserted entry (who/what produced it). */
export interface MemoryEntryProvenance {
  taskId?: string | null;
  runId?: string | null;
  sourceKind?: MemorySourceKind | null;
  sourceRefId?: string | null;
}

/**
 * memory.correct (§3 memory) — supersede/replace a prior memory entry. The OLD entry is marked
 * corrected (supersededById → the new entry, supersededAt → now) so it drops out of recall; a NEW entry
 * is written with the corrected content while PRESERVING the original provenance (sourceTaskId /
 * sourceKind / sourceRefId are inherited unless the caller overrides them). Both rows are kept for the
 * audit trail. Workspace + agent scoped: an id owned by another agent (or already superseded) is a
 * no-op → null. Records a `correct` op (subjectId = the old entry). Returns the new entry, or null.
 */
export async function correctAgentMemory(
  workspaceId: string,
  agentId: string,
  memoryId: string,
  newContent: string,
  provenance?: MemoryEntryProvenance,
): Promise<AgentMemory | null> {
  const start = Date.now();
  const content = newContent.trim();
  // Only a LIVE, in-scope entry can be corrected (already-superseded / other-agent ids are refused).
  const old = await prisma.agentMemory.findFirst({
    where: { id: memoryId, workspaceId, agentId, supersededById: null },
  });
  if (!old || !content) {
    await recordMemoryOperation({
      workspaceId,
      agentId,
      provider: "db",
      opType: "correct",
      subjectId: memoryId,
      resultCount: 0,
      success: false,
      error: !old ? "entry not found or already corrected" : "empty correction",
      latencyMs: Date.now() - start,
    }).catch(() => {});
    return null;
  }
  // Provenance is preserved: inherit the original entry's provenance unless the caller overrides it.
  const replacement = await prisma.agentMemory.create({
    data: {
      workspaceId,
      agentId,
      content: content.slice(0, MAX_CAPTURE_CHARS),
      sourceTaskId: provenance?.taskId ?? old.sourceTaskId,
      sourceKind: provenance?.sourceKind ?? old.sourceKind,
      sourceRefId: provenance?.sourceRefId ?? old.sourceRefId,
      recordKey: old.recordKey, // a corrected keyed record keeps its key
    },
  });
  await prisma.agentMemory.update({
    where: { id: old.id },
    data: { supersededById: replacement.id, supersededAt: new Date() },
  });
  await recordMemoryOperation({
    workspaceId,
    agentId,
    provider: "db",
    opType: "correct",
    taskId: provenance?.taskId ?? old.sourceTaskId ?? null,
    runId: provenance?.runId ?? null,
    subjectId: old.id, // the entry that was corrected
    sourceKind: (provenance?.sourceKind ?? old.sourceKind) as MemorySourceKind | null,
    sourceRefId: replacement.id, // the correcting entry
    resultCount: 1,
    latencyMs: Date.now() - start,
    attributionMode: provenance?.runId ? "included_in_run" : null,
  }).catch(() => {});
  return replacement;
}

/** A page of an agent's memory (paginated list) plus the next offset (null when the page is the last). */
export interface MemoryListPage {
  items: AgentMemory[];
  nextOffset: number | null;
}

/**
 * memory.list (§3 memory) — list an agent's LIVE memory entries, newest-first, scoped + paginated
 * (offset/limit). Distinct from search (no query filter) and from the crude newest-20 inject: this is
 * the agent-facing "what do I remember" enumeration. Records a `list` op with the returned count.
 */
export async function listAgentMemory(
  workspaceId: string,
  agentId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<MemoryListPage> {
  const start = Date.now();
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  // Over-fetch by one to know whether another page exists (cheap next-offset signal).
  const rows = await prisma.agentMemory.findMany({
    where: { workspaceId, agentId, supersededById: null },
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: limit + 1,
  });
  const items = rows.slice(0, limit);
  const nextOffset = rows.length > limit ? offset + limit : null;
  await recordMemoryOperation({
    workspaceId,
    agentId,
    provider: "db",
    opType: "list",
    resultCount: items.length,
    latencyMs: Date.now() - start,
  }).catch(() => {});
  return { items, nextOffset };
}

/** Result of a keyed upsert: the (created or updated) entry and whether it was newly created. */
export interface MemoryUpsertResult {
  entry: AgentMemory;
  created: boolean;
}

/**
 * memory.record_upsert (§3 memory) — idempotent upsert of a keyed memory record. Dedupe is by a stable
 * app-supplied `key` per (workspace, agent): the FIRST upsert inserts, subsequent upserts with the same
 * key UPDATE the same row (content + provenance refreshed, updatedAt bumped) rather than appending a
 * duplicate. Workspace + agent scoped. Records a `record_upsert` op. Returns the entry + `created`.
 */
export async function upsertAgentMemoryRecord(
  workspaceId: string,
  agentId: string,
  key: string,
  content: string,
  provenance?: MemoryEntryProvenance,
): Promise<MemoryUpsertResult | null> {
  const start = Date.now();
  const recordKey = key.trim();
  const body = content.trim();
  if (!recordKey || !body) return null;
  const existing = await prisma.agentMemory.findFirst({
    where: { workspaceId, agentId, recordKey, supersededById: null },
    orderBy: { createdAt: "desc" },
  });
  let entry: AgentMemory;
  let created: boolean;
  if (existing) {
    entry = await prisma.agentMemory.update({
      where: { id: existing.id },
      data: {
        content: body.slice(0, MAX_CAPTURE_CHARS),
        sourceTaskId: provenance?.taskId ?? existing.sourceTaskId,
        sourceKind: provenance?.sourceKind ?? existing.sourceKind,
        sourceRefId: provenance?.sourceRefId ?? existing.sourceRefId,
      },
    });
    created = false;
  } else {
    entry = await prisma.agentMemory.create({
      data: {
        workspaceId,
        agentId,
        content: body.slice(0, MAX_CAPTURE_CHARS),
        recordKey,
        sourceTaskId: provenance?.taskId ?? null,
        sourceKind: provenance?.sourceKind ?? (provenance?.runId ? "run" : "manual_note"),
        sourceRefId: provenance?.sourceRefId ?? provenance?.runId ?? null,
      },
    });
    created = true;
  }
  await recordMemoryOperation({
    workspaceId,
    agentId,
    provider: "db",
    opType: "record_upsert",
    taskId: provenance?.taskId ?? null,
    runId: provenance?.runId ?? null,
    subjectId: entry.id,
    sourceKind: entry.sourceKind as MemorySourceKind | null,
    sourceRefId: recordKey,
    resultCount: 1,
    latencyMs: Date.now() - start,
    attributionMode: provenance?.runId ? "included_in_run" : null,
  }).catch(() => {});
  return { entry, created };
}
