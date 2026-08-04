/**
 * Structured logger for server-side code.
 * Mirrors the API logger format for consistency.
 *
 * Every emitted line is passed through redactSensitive() so a bearer token / DB URL / provider key /
 * email that slips into `message` or `extra` (or an error stack) never lands in stdout / log aggregation.
 */
import { redactSensitive } from "@agentcenter/utils";

type LogLevel = "info" | "warn" | "error";

function emit(
  level: LogLevel,
  tag: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    tag,
    message,
    ...extra,
  };

  // Redact secrets on the fully-serialized line (covers message + nested extra + any embedded stack).
  const json = redactSensitive(JSON.stringify(entry));

  switch (level) {
    case "warn":
      console.warn(json);
      break;
    case "error":
      console.error(json);
      break;
    default:
      console.info(json);
  }
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
