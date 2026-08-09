/**
 * Persistent-server drain loop for the sandbox run queue (Tier D).
 *
 * On Vercel a run longer than the function limit can never complete — the `run-sandbox-queue` cron
 * only drains what fits in one invocation. On a long-lived Node deploy (`server.ts`) we instead poll
 * the queue in-process, so a run can execute for as long as the process lives (git clone + runtime
 * install + a real agent run). This is the off-Vercel path; the cron stays as the Vercel fallback.
 *
 * Non-overlapping: a slow drain never stacks a second concurrent drain on top of itself. Errors are
 * swallowed (logged) so a transient DB/provider failure never kills the loop.
 */
import { drainSandboxRunQueue } from "./sandbox-run";

/** How often to poll the queue when idle. Overridable for constrained deploys. */
const DRAIN_INTERVAL_MS = Number(process.env.SANDBOX_DRAIN_INTERVAL_MS) || 15_000;
/** Max runs claimed per tick — bounds concurrent in-process executions. */
const DRAIN_BATCH = Number(process.env.SANDBOX_DRAIN_BATCH) || 3;

let interval: ReturnType<typeof setInterval> | null = null;
let draining = false;

export function startSandboxDrainLoop(): void {
  if (interval) return; // idempotent
  interval = setInterval(async () => {
    if (draining) return; // never overlap a slow drain
    draining = true;
    try {
      const started = await drainSandboxRunQueue(DRAIN_BATCH);
      if (started > 0) console.log(`[sandbox-drain] started ${started} run(s)`);
    } catch (err) {
      console.error("[sandbox-drain] drain failed:", err);
    } finally {
      draining = false;
    }
  }, DRAIN_INTERVAL_MS);
  // Don't keep the event loop alive solely for this timer.
  if (typeof interval.unref === "function") interval.unref();
}

/** Stop the loop (tests / graceful shutdown). */
export function stopSandboxDrainLoop(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
