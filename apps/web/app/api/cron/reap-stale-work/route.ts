/**
 * GET /api/cron/reap-stale-work
 *
 * Self-healing backstop for "running AI work on remote machines". Runs every 5 minutes and recovers
 * work abandoned by a dead/hung/disconnected worker so it can't sit stuck forever:
 *  - evaluateWatchdogs — auto-fire task watchdogs (lease_expired / no_heartbeat → release/pause).
 *  - sweepExpiredCheckouts — release every task checkout whose lease expired.
 *  - reapStuckRunnerCommands — `running` past their deadline → `timeout`.
 *  - reapStaleLeases — reuse/retain env-lease machines past their TTL → destroyed + `expired`.
 *  - reapStaleTerminalSessions — orphaned `active` / never-connected `pending` → closed / expired.
 *  - deadLetterExhaustedDeliveries — un-acked live deliveries past the attempt cap → dead-lettered.
 *  - redeliverStalePending — re-push un-acked live deliveries to still-connected agents.
 *  - tickRoutineTriggers — fire cron routine triggers whose nextFireAt has passed (Domain 9 #12).
 *  - promoteDueRunRetries — re-dispatch transiently-failed runs whose backoff has elapsed (Domain 9 #6).
 *  - reconcileStrandedWork — re-dispatch (once) then escalate-to-blocked tasks whose run died (Domain 9 #8).
 *  - tickDueTaskMonitors — fire agent-armed one-shot "check back later" monitors that are due (Domain 9 #11).
 *  - scanSilentRuns — record output-silence verdicts for running runs gone quiet (Domain 9 #10).
 *  - reconcileActiveSubtreeWatchdogs — wake a verify agent when a stopped subtree's fingerprint changes (Domain 9 #9).
 *  - pruneTelemetry — retention-prune first-party telemetry events by class (Domain 12 E).
 *  - drainMemoryJobs — run one lease-protected batch of async memory-capture jobs (MEMORY-gated).
 *  - refreshDueExternalObjects — re-fetch stale cached PR/issue snapshots (EXTERNAL_OBJECTS-gated).
 *  - drainAgentWakeups — deliver the coalesced proactive per-agent wake queue, respecting suppression (parity: heartbeat.wakeup).
 *
 * Registered in vercel.json to run every 5 minutes.
 */
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { env } from "@/server/env";
import { reapStuckRunnerCommands } from "@/server/services/runner-commands";
import { reapStaleLeases } from "@/server/services/environment-leases";
import { reapStaleTerminalSessions } from "@/server/services/terminals";
import { sweepExpiredCheckouts } from "@/server/services/task-checkout";
import { evaluateWatchdogs } from "@/server/services/task-watchdog";
import { deadLetterExhaustedDeliveries } from "@agentcenter/database";
import { redeliverStalePending } from "@/server/services/live-task-delivery";
import { tickRoutineTriggers } from "@/server/services/routines";
import { promoteDueRunRetries } from "@/server/services/run-retry";
import { reconcileStrandedWork } from "@/server/services/stranded-work";
import { tickDueTaskMonitors } from "@/server/services/task-monitors";
import { scanSilentRuns } from "@/server/services/run-silence-watchdog";
import { reconcileActiveSubtreeWatchdogs } from "@/server/services/subtree-watchdog";
import { pruneTelemetry } from "@/server/services/telemetry-sink";
import { drainMemoryJobs } from "@/server/services/memory-jobs";
import { refreshDueExternalObjects } from "@/server/services/external-objects";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { drainAgentWakeups } from "@/server/services/agent-wakeups";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return errorResponse("Unauthorized", 401);
    }
    const now = new Date();
    // Watchdogs FIRST + sequentially: they read expired leases to record recovery decisions; the
    // blanket sweep below would otherwise clear those leases before the watchdog sees them, losing
    // the audit trail. The remaining reapers are independent + idempotent, so they run in parallel.
    const watchdogDecisions = await evaluateWatchdogs(now);
    const [
      checkoutsReleased,
      commandsReaped,
      leasesReaped,
      terminals,
      deliveriesDeadLettered,
      deliveriesRepushed,
      routinesFired,
      retriesPromoted,
      monitorsFired,
      silentRuns,
      subtreeWake,
      telemetryPruned,
      memoryJobs,
      externalObjects,
    ] = await Promise.all([
      sweepExpiredCheckouts(now),
      reapStuckRunnerCommands(now),
      reapStaleLeases(),
      reapStaleTerminalSessions(now),
      deadLetterExhaustedDeliveries(5, now),
      redeliverStalePending(now),
      tickRoutineTriggers(now),
      promoteDueRunRetries(now),
      tickDueTaskMonitors(now),
      // Domain 9 #10/#9: product watchdogs — record output-silence + subtree-stop verdicts (waking the
      // agent is the runtime seam). Domain 12 E: retention-prune telemetry. All best-effort.
      scanSilentRuns(undefined, { now: now.getTime() }).catch(() => []),
      reconcileActiveSubtreeWatchdogs().catch(() => ({ checked: 0, toWake: 0 })),
      pruneTelemetry().catch(() => 0),
      // Async memory-capture drain (Paperclip memory-jobs port). Self-gated behind the MEMORY flag; runs
      // one lease-protected batch of queued capture jobs through the existing capture path. Best-effort.
      drainMemoryJobs(now).catch(() => ({ claimed: 0, completed: 0, failed: 0 })),
      // External-object background poller: re-fetch stale cached PR/issue snapshots. EXTERNAL_OBJECTS-
      // gated (mirrors the on-demand mutation); reuses the same provider fetch. Best-effort.
      isFeatureEnabled(FLAG_KEYS.EXTERNAL_OBJECTS)
        .then((on) =>
          on ? refreshDueExternalObjects({ now }) : { due: 0, refreshed: 0, failed: 0 },
        )
        .catch(() => ({ due: 0, refreshed: 0, failed: 0 })),
    ]);
    // Stranded-work reconciliation runs AFTER retry promotion so a run that just earned a retry (now
    // queued) is not mistaken for stranded. Owner-preserving re-dispatch → escalate-to-blocked ladder.
    const stranded = await reconcileStrandedWork(now);
    // Drain the proactive wake queue LAST so it delivers the coalesced wakes that retry-promotion and
    // stranded re-dispatch just enqueued this tick (respecting per-agent / instance suppression).
    const wakes = await drainAgentWakeups(now);
    return successResponse({
      ok: true,
      watchdogsFired: watchdogDecisions.length,
      checkoutsReleased,
      commandsReaped,
      leasesReaped,
      terminalsClosed: terminals.closed,
      terminalsExpired: terminals.expired,
      deliveriesDeadLettered,
      deliveriesRepushed,
      routinesFired,
      retriesPromoted,
      monitorsFired,
      strandedRedispatched: stranded.redispatched,
      strandedEscalated: stranded.escalated,
      silentRunsFlagged: silentRuns.length,
      subtreeWatchdogsWoken: subtreeWake.toWake,
      telemetryPruned,
      memoryJobsDrained: memoryJobs.completed,
      memoryJobsFailed: memoryJobs.failed,
      externalObjectsRefreshed: externalObjects.refreshed,
      wakesDelivered: wakes.delivered,
      wakesSuppressed: wakes.suppressed,
      at: now.toISOString(),
    });
  } catch (err) {
    return handleError(err);
  }
}
