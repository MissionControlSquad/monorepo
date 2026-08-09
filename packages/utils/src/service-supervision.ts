// Local service supervision policy (parity #95, pure half). A supervisor keeps local_stdio services
// (e.g. MCP runtime slots) alive: restart on crash, but SUPPRESS a restart storm (a service that keeps
// dying), and EVICT services idle too long. These are the PURE decisions; the actual spawn/kill/health
// probe is the infra seam.

export interface RestartStormOptions {
  /** Max restarts allowed within the window before suppressing further restarts. */
  maxRestarts?: number;
  /** Rolling window (ms) the restart count is measured over. */
  windowMs?: number;
}

export interface RestartDecision {
  allow: boolean;
  reason: string;
  /** Recent restarts counted within the window (for observability). */
  recentRestarts: number;
}

/**
 * Decide whether a crashed service may be restarted. Counts restarts whose timestamps fall inside the
 * rolling window; once they reach `maxRestarts`, further restarts are suppressed (the service is
 * crash-looping and needs attention, not another spawn). Deterministic given (history, now).
 */
export function shouldRestartService(
  restartHistory: number[], // ms-epoch timestamps of prior restarts
  now: number,
  opts: RestartStormOptions = {},
): RestartDecision {
  const maxRestarts = opts.maxRestarts ?? 5;
  const windowMs = opts.windowMs ?? 60_000;
  const recentRestarts = restartHistory.filter((t) => now - t < windowMs).length;
  if (recentRestarts >= maxRestarts)
    return {
      allow: false,
      reason: `restart storm: ${recentRestarts} restarts in ${Math.round(windowMs / 1000)}s`,
      recentRestarts,
    };
  return { allow: true, reason: "within restart budget", recentRestarts };
}

/** True when a service has been idle at least `idleMs` and may be evicted to free resources. */
export function shouldEvictIdle(
  lastActivityAt: Date | null,
  now: number,
  idleMs: number,
): boolean {
  if (!lastActivityAt) return false;
  return now - lastActivityAt.getTime() >= idleMs;
}
