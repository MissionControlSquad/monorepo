import { redactSensitive } from "@agentcenter/utils";
import { getClientIp } from "./client-ip";
import { redactHttpPath, shouldRedactPath, shouldSilenceHttpSuccessLog } from "./http-log-policy";

function getIp(request?: Request): string | undefined {
  if (!request) return undefined;
  const ip = getClientIp(request.headers);
  return ip !== "unknown" ? ip : undefined;
}

function getRequestMeta(request?: Request) {
  if (!request) return {};
  const url = new URL(request.url, "http://localhost");
  // Redact token-bearing path segments (activation/reset/pairing/signed URLs) before logging.
  const path = shouldRedactPath(url.pathname) ? redactHttpPath(url.pathname) : url.pathname;
  return {
    ip: getIp(request),
    method: request.method,
    path,
    requestId: request.headers.get("x-request-id") ?? undefined,
  };
}

type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, tag: string, message: string, request?: Request): void {
  // HTTP log policy: an info-level line IS the 2xx success/access log for a request. Silence it for
  // high-frequency polling endpoints (connection/quota/health) so aggregation isn't drowned. Warn/error
  // are never silenced. Non-request info logs always emit.
  if (level === "info" && request) {
    const { pathname } = new URL(request.url, "http://localhost");
    if (shouldSilenceHttpSuccessLog(request.method, pathname, 200)) return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    tag,
    message,
    ...getRequestMeta(request),
  };

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

export function log(tag: string, message: string, request?: Request): void {
  emit("info", tag, message, request);
}

export function logWarn(tag: string, message: string, request?: Request): void {
  emit("warn", tag, message, request);
}

export function logError(tag: string, message: string, request?: Request): void {
  emit("error", tag, message, request);
}

/**
 * Measure the duration of an async operation and log it.
 * Usage:
 *   const result = await withTiming("api", "GET /api/tasks", request, async () => { ... });
 */
export async function withTiming<T>(
  tag: string,
  label: string,
  request: Request | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration_ms = Math.round(performance.now() - start);
    emit("info", tag, `${label} completed in ${duration_ms}ms`, request);
  }
}
