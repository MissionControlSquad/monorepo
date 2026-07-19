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
    ] = await Promise.all([
      sweepExpiredCheckouts(now),
      reapStuckRunnerCommands(now),
      reapStaleLeases(),
      reapStaleTerminalSessions(now),
      deadLetterExhaustedDeliveries(5, now),
      redeliverStalePending(now),
      tickRoutineTriggers(now),
      promoteDueRunRetries(now),
    ]);
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
      at: now.toISOString(),
    });
  } catch (err) {
    return handleError(err);
  }
}
