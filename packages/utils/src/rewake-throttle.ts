// Re-wake throttle (parity #88). PURE. When work is re-woken repeatedly (a blocked task freed, an issue
// rescheduling itself), a throttle prevents thrash: it enforces a minimum interval between wakes and an
// exponential backoff as consecutive wakes pile up without the work making progress. The heartbeat /
// dependency-wakeup path consults this before waking; it holds no state (the caller passes the history).

export interface RewakeState {
  /** When this unit was last woken (ms epoch), or null if never. */
  lastWakeAt: number | null;
  /** How many times it has been woken in a row without observed progress. */
  consecutiveWakes: number;
}

export interface RewakeDecision {
  allow: boolean;
  /** ms until the next wake is allowed (0 when allow=true). */
  waitMs: number;
  reason: string;
}

/**
 * Decide whether a unit may be re-woken now. The effective cooldown is `baseIntervalMs` scaled by an
 * exponential backoff on `consecutiveWakes` (capped at `maxIntervalMs`), so runaway re-wakes are damped
 * without ever blocking the first wake. Deterministic given (state, now).
 */
export function shouldRewake(
  state: RewakeState,
  now: number,
  opts: { baseIntervalMs?: number; maxIntervalMs?: number; backoffFactor?: number } = {},
): RewakeDecision {
  const base = opts.baseIntervalMs ?? 60_000; // 1 min
  const max = opts.maxIntervalMs ?? 60 * 60_000; // 1 h
  const factor = opts.backoffFactor ?? 2;

  if (state.lastWakeAt == null) return { allow: true, waitMs: 0, reason: "never woken" };

  const cooldown = Math.min(max, base * factor ** Math.max(0, state.consecutiveWakes - 1));
  const elapsed = now - state.lastWakeAt;
  if (elapsed >= cooldown) return { allow: true, waitMs: 0, reason: "cooldown elapsed" };
  return {
    allow: false,
    waitMs: cooldown - elapsed,
    reason: `throttled: ${Math.ceil((cooldown - elapsed) / 1000)}s until next wake`,
  };
}

/**
 * Advance the throttle state after a wake. `madeProgress` resets the consecutive-wake counter (backoff
 * relaxes when the work is actually moving); otherwise it increments.
 */
export function advanceRewakeState(
  state: RewakeState,
  now: number,
  madeProgress: boolean,
): RewakeState {
  return {
    lastWakeAt: now,
    consecutiveWakes: madeProgress ? 0 : state.consecutiveWakes + 1,
  };
}
