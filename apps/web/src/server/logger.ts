/**
 * Structured logger for server-side code - backed by pino.
 *
 * The public API (log / logWarn / logError with the same tag/message/extra signature) and the emitted
 * line shape ({ timestamp, level, tag, message, ...extra }) are unchanged, so every call-site keeps
 * working. Only the implementation moved from a hand-rolled JSON.stringify to pino.
 *
 * Redaction is preserved: every serialized line is passed through redactSensitive() before it is
 * written, so a bearer token / DB URL / provider key / email that slips into `message` or `extra` (or
 * an embedded error stack) never lands in stdout / log aggregation. We redact the whole serialized line
 * (rather than pino's field-path redact) so nested and free-text secrets are caught regardless of key.
 */
import pino from "pino";
import { redactSensitive } from "@agentcenter/utils";

type LogLevel = "info" | "warn" | "error";

// A pino destination that redacts each fully-serialized line, then routes warn/error to stderr and
// everything else to stdout (matching the previous console.info/warn/error behavior).
const redactingDestination = {
  write(line: string): void {
    const out = redactSensitive(line);
    if (line.includes('"level":"error"') || line.includes('"level":"warn"')) {
      process.stderr.write(out);
    } else {
      process.stdout.write(out);
    }
  },
};

const logger = pino(
  {
    // Emit the level as its label ("info"/"warn"/"error") under `level`, matching the old shape.
    formatters: { level: (label) => ({ level: label }) },
    // ISO timestamp under `timestamp` (pino's default is epoch ms under `time`).
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    // The human message lives under `message` (not pino's default `msg`).
    messageKey: "message",
    // Drop pino's default pid/hostname base fields - the old logger never emitted them.
    base: null,
    level: "info",
  },
  redactingDestination,
);

function emit(
  level: LogLevel,
  tag: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  // Merge tag + extra into the record; pino places `message` via messageKey.
  logger[level]({ tag, ...extra }, message);
}

export function log(tag: string, message: string, extra?: Record<string, unknown>): void {
  emit("info", tag, message, extra);
}

export function logWarn(tag: string, message: string, extra?: Record<string, unknown>): void {
  emit("warn", tag, message, extra);
}

export function logError(tag: string, message: string, extra?: Record<string, unknown>): void {
  emit("error", tag, message, extra);
}
