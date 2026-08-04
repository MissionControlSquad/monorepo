// Product run-watchdog classifier (parity Domain-9 #10). PURE. Classifies an ACTIVE run by how long it
// has produced no output: a silent-but-running agent may be stuck. The heartbeat scans running runs,
// classifies each, and opens a review for suspicious/critical ones (honoring a snooze). Distinct from
// the infra lease/heartbeat watchdog. Consumes only our own runner's lastOutputAt — no third party.

export type OutputSilenceState = "ok" | "suspicious" | "critical" | "snoozed";

export interface OutputSilenceThresholds {
  suspiciousMs?: number;
  criticalMs?: number;
}

export interface OutputSilenceResult {
  state: OutputSilenceState;
  silenceMs: number;
  reason: string;
}

/**
 * Classify output silence. A live snooze wins. Otherwise silence past `criticalMs` is critical, past
 * `suspiciousMs` is suspicious, else ok. `lastOutputAt` null → treat run start as the baseline.
 */
export function classifyOutputSilence(input: {
  lastOutputAt: Date | null;
  startedAt: Date;
  now: number;
  snoozedUntil?: Date | null;
  thresholds?: OutputSilenceThresholds;
}): OutputSilenceResult {
  const suspiciousMs = input.thresholds?.suspiciousMs ?? 5 * 60_000;
  const criticalMs = input.thresholds?.criticalMs ?? 15 * 60_000;

  if (input.snoozedUntil && input.snoozedUntil.getTime() > input.now)
    return { state: "snoozed", silenceMs: 0, reason: "snoozed" };

  const baseline = (input.lastOutputAt ?? input.startedAt).getTime();
  const silenceMs = Math.max(0, input.now - baseline);
  if (silenceMs >= criticalMs)
    return { state: "critical", silenceMs, reason: `silent ${Math.round(silenceMs / 60_000)}m` };
  if (silenceMs >= suspiciousMs)
    return { state: "suspicious", silenceMs, reason: `silent ${Math.round(silenceMs / 60_000)}m` };
  return { state: "ok", silenceMs, reason: "producing output" };
}
