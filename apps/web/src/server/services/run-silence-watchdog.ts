import { prisma } from "@/server/prisma";
import { classifyOutputSilence, type OutputSilenceThresholds } from "@agentcenter/utils";

// Silent active-run watchdog (parity Domain-9 #10). Scans RUNNING runs and classifies each by output
// silence; records a decision for suspicious/critical runs (honoring a per-run snooze). The heartbeat
// calls scanSilentRuns; a critical verdict is the signal to open a recovery review. Workspace-scoped.

export interface SilenceFlag {
  runId: string;
  state: "suspicious" | "critical";
  silenceMs: number;
}

/**
 * Classify every running run's output silence and record a decision for the non-ok ones. Returns the
 * flagged (suspicious/critical) runs so the heartbeat can act. `now` is injectable for tests.
 */
export async function scanSilentRuns(
  workspaceId: string | undefined,
  opts: { thresholds?: OutputSilenceThresholds; now?: number } = {},
): Promise<SilenceFlag[]> {
  const now = opts.now ?? Date.now();
  // workspaceId undefined → sweep every workspace (the heartbeat cron use); each decision carries the
  // run's own workspaceId so global + scoped scans record correctly.
  const runs = await prisma.agentRun.findMany({
    where: { status: "running", ...(workspaceId ? { workspaceId } : {}) },
    select: {
      id: true,
      workspaceId: true,
      startedAt: true,
      lastOutputAt: true,
      watchdogSnoozedUntil: true,
    },
  });

  const flags: SilenceFlag[] = [];
  const decisions: {
    workspaceId: string;
    runId: string;
    state: string;
    silenceMs: number;
    reason: string;
  }[] = [];

  for (const run of runs) {
    const result = classifyOutputSilence({
      lastOutputAt: run.lastOutputAt,
      startedAt: run.startedAt,
      now,
      snoozedUntil: run.watchdogSnoozedUntil,
      thresholds: opts.thresholds,
    });
    if (result.state === "ok" || result.state === "snoozed") continue;
    decisions.push({
      workspaceId: run.workspaceId,
      runId: run.id,
      state: result.state,
      silenceMs: result.silenceMs,
      reason: result.reason,
    });
    flags.push({ runId: run.id, state: result.state, silenceMs: result.silenceMs });
  }
  if (decisions.length) await prisma.runWatchdogDecision.createMany({ data: decisions });
  return flags;
}

/** Snooze a run's silence watchdog (e.g. an agent legitimately waiting on a long external job). */
export async function snoozeRunWatchdog(
  workspaceId: string,
  runId: string,
  until: Date,
): Promise<void> {
  await prisma.agentRun.updateMany({
    where: { id: runId, workspaceId },
    data: { watchdogSnoozedUntil: until },
  });
}
