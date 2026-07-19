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
  type MemoryOpType,
  type MemorySourceKind,
  type MemoryProvider,
} from "@agentcenter/utils";

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
  attributionMode?: string | null;
}): Promise<MemoryOperation> {
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
      attributionMode: input.attributionMode ?? null,
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
    where: { workspaceId, agentId },
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
  const rows = await readAgentMemory(workspaceId, agentId, 20);
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
  const text = rows
    .reverse()
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
