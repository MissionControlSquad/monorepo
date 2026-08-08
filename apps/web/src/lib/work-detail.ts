// Pure formatting/selection helpers shared by the pipeline / routine / execution-workspace detail
// routes. Kept free of React + urql so they are unit-testable in isolation.

export interface StageLike {
  id: string;
  name: string;
  order: number;
}

export interface CaseLike {
  status: string;
  currentStageId: string | null;
}

/** Stages sorted by their declared order (ascending). Never mutates the input. */
export function sortStages<T extends StageLike>(stages: readonly T[]): T[] {
  return [...stages].sort((a, b) => a.order - b.order);
}

/**
 * The id of the stage after `currentStageId` in order, or null if the case is at (or past) the last
 * stage / has no current stage. Mirrors the "advance forward" rule used on the pipeline list.
 */
export function nextStageId(
  stages: readonly StageLike[],
  currentStageId: string | null,
): string | null {
  const ordered = sortStages(stages);
  const idx = ordered.findIndex((s) => s.id === currentStageId);
  return idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1].id : null;
}

/** Number of active (not done, not rejected) cases sitting on each stage id. */
export function caseCountsByStage(
  stages: readonly StageLike[],
  cases: readonly CaseLike[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of stages) counts[s.id] = 0;
  for (const c of cases) {
    if (c.status === "done" || c.status === "rejected") continue;
    if (c.currentStageId && c.currentStageId in counts) counts[c.currentStageId] += 1;
  }
  return counts;
}

export type StatusVariant = "gray" | "blue" | "yellow" | "green" | "red";

/** Badge colour for a pipeline case status. */
export function caseStatusVariant(status: string): StatusVariant {
  if (status === "rejected") return "red";
  if (status === "done") return "green";
  if (status === "in_review") return "yellow";
  if (status === "claimed" || status === "transitioned") return "blue";
  return "gray";
}

/** Badge colour for a routine run status. */
export function runStatusVariant(status: string): StatusVariant {
  if (status === "failed" || status === "cancelled") return "red";
  if (status === "succeeded") return "green";
  if (status === "running") return "blue";
  return "gray"; // queued
}

export interface TriggerLike {
  type: string;
  cronExpression?: string | null;
  timezone?: string | null;
  publicId?: string | null;
}

/**
 * Human-readable summary of a routine trigger. Cron triggers show their expression (+ tz);
 * webhook triggers show their public fire path; manual triggers say so.
 */
export function describeTrigger(trigger: TriggerLike): string {
  if (trigger.type === "cron") {
    const expr = trigger.cronExpression?.trim();
    if (!expr) return "cron (no schedule)";
    return trigger.timezone ? `cron ${expr} (${trigger.timezone})` : `cron ${expr}`;
  }
  if (trigger.type === "webhook") {
    return trigger.publicId ? `webhook /api/routines/fire/${trigger.publicId}` : "webhook (no url)";
  }
  return "manual";
}

/** Select one execution workspace out of a workspace-scoped list by id (list resolver reuse). */
export function selectWorkspaceById<T extends { id: string }>(
  list: readonly T[] | undefined | null,
  id: string,
): T | null {
  return list?.find((w) => w.id === id) ?? null;
}

/**
 * The primary named project workspace out of a workspace-scoped list. Mirrors the server's
 * `getPrimaryProjectWorkspace` ordering (isPrimary desc, then oldest createdAt) so the detail view
 * highlights the same source template a run clones from. Never mutates the input; null when empty.
 */
export function selectPrimaryProjectWorkspace<
  T extends { isPrimary: boolean; createdAt?: string | null },
>(list: readonly T[] | undefined | null): T | null {
  if (!list || list.length === 0) return null;
  return [...list].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  })[0];
}

/** Compact "YYYY-MM-DD HH:MM:SS" from an ISO timestamp; empty string for a missing value. */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 19).replace("T", " ");
}
