/**
 * Tier D / Phase 3 (Plan 6) — live run runtime status. An in-memory, short-TTL, REDACTED tail of a
 * sandbox run's output + its current phase, so the UI can watch a run mid-flight (poll) instead of
 * waiting for the batch result. Ported from Paperclip's heartbeat-run-runtime-status (in-mem, ~90s TTL,
 * secret redaction). Deliberately ephemeral: this is a liveness surface, not the durable ledger
 * (AgentRun holds the persisted result). Best-effort — never a correctness dependency of a run.
 */
import { redactRunSecrets } from "@agentcenter/utils";

const TTL_MS = 90_000;
const MAX_TAIL = 8_000;

export type RunPhase =
  "queued" | "provisioning" | "running" | "done" | "failed" | "timeout" | "canceled";

interface RunStatus {
  runId: string;
  phase: RunPhase;
  tail: string;
  redactValues: string[]; // secret values to scrub from any appended chunk
  updatedAt: number;
}

const statuses = new Map<string, RunStatus>();

function sweep(now: number): void {
  for (const [id, s] of statuses) {
    if (now - s.updatedAt > TTL_MS) statuses.delete(id);
  }
}

/** Redact known secret values (env values, git token) from a chunk before it is stored/surfaced. */
function redact(text: string, values: string[]): string {
  return redactRunSecrets(text, values);
}

/** Begin tracking a run (records the values that must be scrubbed from its live tail). */
export function beginRunStatus(runId: string, redactValues: string[], now = Date.now()): void {
  sweep(now);
  statuses.set(runId, { runId, phase: "provisioning", tail: "", redactValues, updatedAt: now });
}

export function setRunPhase(runId: string, phase: RunPhase, now = Date.now()): void {
  const s = statuses.get(runId);
  if (!s) return;
  s.phase = phase;
  s.updatedAt = now;
}

export function appendRunLog(runId: string, chunk: string, now = Date.now()): void {
  const s = statuses.get(runId);
  if (!s) return;
  const redacted = redact(chunk, s.redactValues);
  s.tail = (s.tail + redacted).slice(-MAX_TAIL);
  s.updatedAt = now;
}

/** The live status for a run, or null if none is tracked (never started, or TTL-evicted). */
export function getRunRuntimeStatus(
  runId: string,
  now = Date.now(),
): { phase: RunPhase; tail: string } | null {
  sweep(now);
  const s = statuses.get(runId);
  if (!s) return null;
  return { phase: s.phase, tail: s.tail };
}

/** Test/shutdown helper. */
export function clearRunStatuses(): void {
  statuses.clear();
}
