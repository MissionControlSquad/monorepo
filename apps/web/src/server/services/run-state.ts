import { prisma } from "@/server/prisma";
import type { RunScratch, RunSkillSelection, RunHandoffState } from "@agentcenter/database";
import { badRequest } from "./service-errors";

// Per-run runtime state (parity #145/#146/#155). Scratch KV, skill selections, and the successful-run
// handoff a continuation reads. Workspace-scoped. The agent runtime is the writer; the UI and
// continuation runs are the readers.

const HANDOFF_OUTCOMES = new Set(["success", "partial"]);
const SKILL_SOURCES = new Set(["auto", "pinned", "inherited"]);

// ── Run scratch (#145) ────────────────────────────────────────────────────────
export function setRunScratch(
  workspaceId: string,
  runId: string,
  key: string,
  value: unknown,
): Promise<RunScratch> {
  if (!key?.trim()) badRequest("scratch key is required");
  return prisma.runScratch.upsert({
    where: { runId_key: { runId, key } },
    create: { workspaceId, runId, key, value: value as never },
    update: { value: value as never },
  });
}

export async function getRunScratch(runId: string, key: string): Promise<unknown | null> {
  const row = await prisma.runScratch.findUnique({
    where: { runId_key: { runId, key } },
    select: { value: true },
  });
  return row ? row.value : null;
}

export async function listRunScratch(runId: string): Promise<{ key: string; value: unknown }[]> {
  const rows = await prisma.runScratch.findMany({
    where: { runId },
    orderBy: { key: "asc" },
    select: { key: true, value: true },
  });
  return rows.map((r) => ({ key: r.key, value: r.value }));
}

/** Clear a run's scratch — the runtime calls this when a run ends (scratch is ephemeral). */
export async function clearRunScratch(runId: string): Promise<number> {
  const { count } = await prisma.runScratch.deleteMany({ where: { runId } });
  return count;
}

// ── Runtime skill selections (#146) ───────────────────────────────────────────
export async function recordSkillSelection(input: {
  workspaceId: string;
  runId: string;
  skillId: string;
  skillSlug?: string | null;
  source?: string;
  score?: number | null;
}): Promise<RunSkillSelection> {
  const source = input.source ?? "auto";
  if (!SKILL_SOURCES.has(source)) badRequest("source must be auto, pinned, or inherited");
  return prisma.runSkillSelection.upsert({
    where: { runId_skillId: { runId: input.runId, skillId: input.skillId } },
    create: {
      workspaceId: input.workspaceId,
      runId: input.runId,
      skillId: input.skillId,
      skillSlug: input.skillSlug ?? null,
      source,
      score: input.score ?? null,
    },
    update: { source, score: input.score ?? null, skillSlug: input.skillSlug ?? null },
  });
}

export function listSkillSelections(runId: string): Promise<RunSkillSelection[]> {
  return prisma.runSkillSelection.findMany({
    where: { runId },
    orderBy: [{ score: "desc" }, { createdAt: "asc" }],
  });
}

// ── Successful-run handoff state (#155) ───────────────────────────────────────
export async function writeHandoffState(input: {
  workspaceId: string;
  runId: string;
  agentId?: string | null;
  taskId?: string | null;
  outcome: string;
  summary: string;
  nextSteps?: string[];
  artifactRefs?: unknown;
}): Promise<RunHandoffState> {
  if (!HANDOFF_OUTCOMES.has(input.outcome)) badRequest("outcome must be success or partial");
  if (!input.summary?.trim()) badRequest("summary is required");
  const data = {
    agentId: input.agentId ?? null,
    taskId: input.taskId ?? null,
    outcome: input.outcome,
    summary: input.summary,
    nextSteps: input.nextSteps ?? [],
    artifactRefs: (input.artifactRefs ?? undefined) as never,
  };
  return prisma.runHandoffState.upsert({
    where: { runId: input.runId },
    create: { workspaceId: input.workspaceId, runId: input.runId, ...data },
    update: data,
  });
}

export function getHandoffState(runId: string): Promise<RunHandoffState | null> {
  return prisma.runHandoffState.findUnique({ where: { runId } });
}

/** The most recent handoff for a task — what a continuation run on that task carries in. */
export function latestHandoffForTask(
  workspaceId: string,
  taskId: string,
): Promise<RunHandoffState | null> {
  return prisma.runHandoffState.findFirst({
    where: { workspaceId, taskId },
    orderBy: { createdAt: "desc" },
  });
}
