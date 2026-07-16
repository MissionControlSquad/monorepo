/**
 * GET /api/cron/reap-stale-work
 *
 * Self-healing backstop for "running AI work on remote machines". Runs frequently and marks work
 * abandoned by a dead/hung/disconnected worker so it can't sit stuck forever:
 *  - RunnerCommands stuck in `running` past their deadline → `timeout`.
 *  - Terminal sessions past their TTL (orphaned `active`, or never-connected `pending`) → closed/expired.
 *
 * Registered in vercel.json to run every 5 minutes.
 */
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { env } from "@/server/env";
import { reapStuckRunnerCommands } from "@/server/services/runner-commands";
import { reapStaleTerminalSessions } from "@/server/services/terminals";
import { sweepExpiredCheckouts } from "@/server/services/task-checkout";
import { evaluateWatchdogs } from "@/server/services/task-watchdog";
import { deadLetterExhaustedDeliveries } from "@agentcenter/database";
import { redeliverStalePending } from "@/server/services/live-task-delivery";

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
      terminals,
      deliveriesDeadLettered,
      deliveriesRepushed,
    ] = await Promise.all([
      sweepExpiredCheckouts(now),
      reapStuckRunnerCommands(now),
      reapStaleTerminalSessions(now),
      deadLetterExhaustedDeliveries(5, now),
      redeliverStalePending(now),
    ]);
    return successResponse({
      ok: true,
      watchdogsFired: watchdogDecisions.length,
      checkoutsReleased,
      commandsReaped,
      terminalsClosed: terminals.closed,
      terminalsExpired: terminals.expired,
      deliveriesDeadLettered,
      deliveriesRepushed,
      at: now.toISOString(),
    });
  } catch (err) {
    return handleError(err);
  }
}
