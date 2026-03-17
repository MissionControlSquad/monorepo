import { getClientIp } from "./client-ip";

function getIp(request?: Request): string | undefined {
  if (!request) return undefined;
  const ip = getClientIp(request.headers);
  return ip !== "unknown" ? ip : undefined;
}

function getRequestMeta(request?: Request) {
  if (!request) return {};
  const url = new URL(request.url, "http://localhost");
  return {
    ip: getIp(request),
    method: request.method,
    path: url.pathname,
    requestId: request.headers.get("x-request-id") ?? undefined,
  };
}

type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, tag: string, message: string, request?: Request): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    tag,
    message,
    ...getRequestMeta(request),
  };

  const json = JSON.stringify(entry);

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
