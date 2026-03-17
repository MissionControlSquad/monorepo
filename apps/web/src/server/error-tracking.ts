/**
 * Lightweight error tracking module.
 *
 * Captures errors with structured metadata for observability.
 * Currently logs to stdout as structured JSON — plug in Sentry,
 * Datadog, or any external service by replacing the `reportError` call.
 *
 * Usage:
 *   captureError(error, { route: "/api/tasks", method: "POST", agentId: "abc" });
 */

interface ErrorContext {
  route?: string;
  method?: string;
  ip?: string;
  agentId?: string;
  userId?: string;
  [key: string]: unknown;
}

/**
 * Capture and report an error with context.
 */
export function captureError(error: unknown, context?: ErrorContext): void {
  const err = error instanceof Error ? error : new Error(String(error));

  const entry = {
    timestamp: new Date().toISOString(),
    level: "error" as const,
    tag: "error-tracking",
    message: err.message,
    name: err.name,
    stack: err.stack?.split("\n").slice(0, 10).join("\n"),
    ...context,
  };

  console.error(JSON.stringify(entry));
}

/**
 * Capture a warning (non-fatal issue).
 */
export function captureWarning(message: string, context?: ErrorContext): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level: "warn" as const,
    tag: "error-tracking",
    message,
    ...context,
  };

  console.warn(JSON.stringify(entry));
}

/**
 * Helper to extract request metadata for error context.
 */
export function requestContext(request: Request): ErrorContext {
  const url = new URL(request.url, "http://localhost");
  return {
    route: url.pathname,
    method: request.method,
    ip:
      request.headers.get("x-real-ip")?.trim() ||
      request.headers.get("x-forwarded-for")?.split(",").pop()?.trim(),
  };
}
