/**
 * Blocker diagnostics (Domain 8 G6.1) — pure, shared via @agentcenter/utils. Given a task's blockers
 * (from the single blockedByTaskId edge + typed `blocks` relations) and their statuses, computes
 * whether the task is READY to be worked and human-readable readiness reasons. No I/O; the service
 * loads the blocker tasks and calls this.
 */

export interface BlockerInput {
  taskId: string;
  status: string; // the blocker task's status
  source: "blocked_by" | "relation"; // where the blocker edge came from
}

export interface BlockerDetail extends BlockerInput {
  resolved: boolean;
}

export type BlockerReadiness = "ready" | "blocked";

export interface BlockerDiagnostics {
  readiness: BlockerReadiness;
  blockers: BlockerDetail[];
  unresolvedCount: number;
  reasons: string[];
}

/** A blocker is resolved when its task is terminal (done). Everything else still blocks. */
export function isBlockerResolved(status: string): boolean {
  return status === "done";
}

/**
 * Pure: fold blockers into a readiness verdict. `ready` when there are no blockers or all are
 * resolved; `blocked` otherwise. Dedupes by blocker taskId (a task blocked via both the direct edge
 * and a relation counts once). Reasons are stable, human-readable strings.
 */
export function computeBlockerDiagnostics(blockers: BlockerInput[]): BlockerDiagnostics {
  const byId = new Map<string, BlockerInput>();
  for (const b of blockers) {
    // Prefer the "blocked_by" source label if a blocker appears twice.
    const prev = byId.get(b.taskId);
    if (!prev || (prev.source === "relation" && b.source === "blocked_by")) byId.set(b.taskId, b);
  }

  const details: BlockerDetail[] = [...byId.values()].map((b) => ({
    ...b,
    resolved: isBlockerResolved(b.status),
  }));
  const unresolved = details.filter((d) => !d.resolved);

  const reasons: string[] = [];
  if (details.length === 0) {
    reasons.push("No blockers — ready to work.");
  } else if (unresolved.length === 0) {
    reasons.push("All blockers are done — ready to work.");
  } else {
    reasons.push(
      `${unresolved.length} of ${details.length} blocker${details.length === 1 ? "" : "s"} unresolved.`,
    );
    for (const u of unresolved) reasons.push(`Blocked by ${u.taskId} (status: ${u.status}).`);
  }

  return {
    readiness: unresolved.length === 0 ? "ready" : "blocked",
    blockers: details,
    unresolvedCount: unresolved.length,
    reasons,
  };
}
