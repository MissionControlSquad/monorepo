// Productivity assessment (parity #132). PURE — the heartbeat's productivity watchdog feeds it an
// agent's recent signals and gets a verdict + reasons, then records the review. No I/O here.

export type ProductivityVerdict = "productive" | "idle" | "stuck" | "struggling";

export interface ProductivitySignals {
  /** ms since the agent last made observable progress (a completed run, a commit, a status change). */
  idleMs: number;
  runsCompleted: number; // in the review window
  runsFailed: number; // in the review window
  /** ms the agent has been on its current task without completing it (0 if none in progress). */
  currentTaskAgeMs?: number;
  openBlockers?: number; // tasks blocked on something external
}

export interface ProductivityReviewResult {
  verdict: ProductivityVerdict;
  score: number; // 0..1, higher = healthier
  reasons: string[];
}

const HOUR = 3_600_000;

/**
 * Assess productivity from recent signals. Deterministic thresholds (tunable later):
 * - `stuck`: idle a long time OR a single task dragging far too long.
 * - `struggling`: failures dominate completions.
 * - `idle`: quiet but not yet stuck.
 * - `productive`: otherwise.
 * The score blends idleness, the failure ratio, and task drag into a 0..1 health number.
 */
export function assessProductivity(
  signals: ProductivitySignals,
  opts: { idleStuckMs?: number; taskDragMs?: number } = {},
): ProductivityReviewResult {
  const idleStuckMs = opts.idleStuckMs ?? 4 * HOUR;
  const taskDragMs = opts.taskDragMs ?? 24 * HOUR;
  const reasons: string[] = [];

  const totalRuns = signals.runsCompleted + signals.runsFailed;
  const failRatio = totalRuns > 0 ? signals.runsFailed / totalRuns : 0;
  const taskAge = signals.currentTaskAgeMs ?? 0;

  let verdict: ProductivityVerdict;
  if (signals.idleMs >= idleStuckMs || taskAge >= taskDragMs) {
    verdict = "stuck";
    if (signals.idleMs >= idleStuckMs)
      reasons.push(`idle for ${(signals.idleMs / HOUR).toFixed(1)}h`);
    if (taskAge >= taskDragMs)
      reasons.push(`current task open ${(taskAge / HOUR).toFixed(1)}h without completing`);
  } else if (totalRuns >= 3 && failRatio > 0.5) {
    verdict = "struggling";
    reasons.push(`${signals.runsFailed}/${totalRuns} recent runs failed`);
  } else if (signals.runsCompleted === 0 && signals.idleMs >= idleStuckMs / 2) {
    verdict = "idle";
    reasons.push("no completed runs and quiet");
  } else {
    verdict = "productive";
    reasons.push(`${signals.runsCompleted} runs completed`);
  }

  if ((signals.openBlockers ?? 0) > 0) reasons.push(`${signals.openBlockers} blocked task(s)`);

  // Health score: penalize idleness, failures, and task drag; clamp to [0,1].
  const idlePenalty = Math.min(1, signals.idleMs / idleStuckMs) * 0.4;
  const failPenalty = failRatio * 0.4;
  const dragPenalty = Math.min(1, taskAge / taskDragMs) * 0.2;
  const score = Math.max(0, Math.min(1, 1 - idlePenalty - failPenalty - dragPenalty));

  return { verdict, score, reasons };
}
