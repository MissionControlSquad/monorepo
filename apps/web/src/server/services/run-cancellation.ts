/**
 * In-flight run cancellation registry (§3 #2, cancellation half). An active sandbox run registers an
 * `AbortController` here keyed by its AgentRun id BEFORE it calls the provider `exec`; the run's
 * `AbortSignal` is threaded into the sandbox exec path (`SandboxExecOpts.signal`) so aborting it kills
 * the child process / cancels the provider exec. `requestRunCancellation(runId, reason)` looks the run
 * up and aborts it; the run's finalizer reads `signal.aborted` + `signal.reason` to mark the AgentRun
 * `canceled` with a reason.
 *
 * HOW TO TRIGGER A CANCEL (end to end):
 *   - GraphQL `cancelAgentRun(runId)` (RUNNERS-gated, admin) → services/sandbox-run.ts `cancelAgentRun`.
 *   - If the run is QUEUED → it is marked `canceled` in the DB (the worker never picks it up).
 *   - If the run is RUNNING → `requestRunCancellation(runId)` aborts its controller here → the sandbox
 *     exec's signal handler kills the child (local provider `SIGKILL`s the process group; exe-dev kills
 *     the ssh subprocess) → the run finalizer sees `signal.aborted` and persists status `canceled`,
 *     `exitReason="canceled"`, and `cancelReason`.
 *
 * DOCUMENTED LIMITATION — single process only. This registry is IN-PROCESS: a controller only exists in
 * the Node process that is actually executing the run. That is correct for the single-node server (the
 * in-process drain loop) and for a single serverless invocation that runs the task synchronously. It
 * does NOT span processes: on a multi-instance / serverless-fan-out deployment, a cancel request that
 * lands on a different instance than the one running the task will find no controller and fall back to
 * the DB-only queued-cancel (a RUNNING run on another instance is not reachable). A cross-process kill
 * would need a durable cancel flag (e.g. an AgentRun `cancelRequestedAt` column the runner polls) or a
 * provider-side kill-by-sandbox-id — deferred. Cloud providers whose `exec` cannot observe an
 * AbortSignal (SDK calls without a signal option) likewise cannot be hard-killed mid-exec today; the
 * seam passes the signal through so they gain it for free once their SDK path honors it.
 */

/** runId → the AbortController for the currently-executing run in THIS process. */
const activeRuns = new Map<string, AbortController>();

/**
 * Register (and return) an AbortController for a run about to execute in this process. Call this right
 * before `exec` and pass `controller.signal` into the sandbox exec opts; always {@link unregisterRun}
 * in a `finally`. A second register for the same runId supersedes the first (last writer wins).
 */
export function registerRunAbort(runId: string): AbortController {
  const controller = new AbortController();
  activeRuns.set(runId, controller);
  return controller;
}

/** Drop a run's controller once its exec has returned (call from a `finally`). */
export function unregisterRunAbort(runId: string): void {
  activeRuns.delete(runId);
}

/** Is a run currently executing (has a live controller) in THIS process? */
export function isRunActive(runId: string): boolean {
  return activeRuns.has(runId);
}

/**
 * Abort a currently-executing run in this process. Returns true if a controller was found and aborted
 * (the exec path will observe the signal and the finalizer will mark the run canceled), false if the
 * run is not executing here (e.g. queued, already finished, or running on another instance).
 */
export function requestRunCancellation(runId: string, reason = "canceled by operator"): boolean {
  const controller = activeRuns.get(runId);
  if (!controller) return false;
  if (!controller.signal.aborted) controller.abort(new RunCancellationError(reason));
  return true;
}

/** The abort `reason` carried on a cancelled run's signal — its `.message` is the cancel reason. */
export class RunCancellationError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "RunCancellationError";
  }
}

/** Read the human reason off an aborted run signal (defaults when absent/opaque). */
export function cancelReasonFromSignal(signal: AbortSignal): string {
  if (!signal.aborted) return "";
  const r = signal.reason as unknown;
  if (r instanceof Error && r.message) return r.message;
  if (typeof r === "string" && r) return r;
  return "canceled by operator";
}
