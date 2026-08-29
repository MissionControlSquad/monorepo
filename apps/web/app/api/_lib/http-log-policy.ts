/**
 * HTTP log policy (Paperclip parity: `shouldSilenceHttpSuccessLog` + redact-path list). PURE — no
 * I/O — so it is trivially unit-testable and safe to call on the hot request-logging path.
 *
 * Two independent decisions for a given (method, path, status):
 *  - silence:    a successful (2xx) read on a high-frequency polling endpoint is pure noise. We drop
 *                its access log so aggregation isn't drowned by connection/quota/health polls. Errors
 *                (non-2xx) are NEVER silenced — those are exactly what you want to see.
 *  - redactPath: some paths carry a secret/token IN the URL (activation tokens, key rotation, CLI
 *                pairing codes, signed storage URLs). We rewrite those segments to `[redacted]` before
 *                the path is logged, so a token never lands in stdout / log aggregation.
 *
 * This is deliberately a small curated list, not a regex framework — add endpoints as they prove noisy.
 */

export interface HttpLogDecision {
  /** Drop the access log line entirely (success on a polling route). */
  silence: boolean;
  /** Rewrite sensitive segments of the path before logging. */
  redactPath: boolean;
}

/**
 * High-frequency polling endpoints whose 2xx success logs are noise. Matched as a prefix so
 * sub-paths (e.g. `/api/live-gateway/connections/:id`) are covered. Keep GET/HEAD reads only.
 */
export const SILENCE_SUCCESS_PREFIXES: readonly string[] = [
  "/api/health", // liveness/health poll
  "/api/auth/status", // session status poll (client refresh loop)
  "/api/cli-auth/poll", // CLI device-pairing poll
  "/api/agents/me/heartbeat-preflight", // agent heartbeat preflight
  "/api/live-gateway/connections", // live-gateway connection/presence poll
  "/api/provider-quota", // provider quota poll
];

/**
 * Paths that may carry a secret/token in the URL. Their sensitive segments are redacted before
 * logging. Prefix-matched.
 */
export const REDACT_PATH_PREFIXES: readonly string[] = [
  "/api/auth/", // activation / reset flows (token in path or query)
  "/api/license", // license activation key
  "/api/cli-auth/", // device pairing codes
  "/api/storage/", // signed object URLs
  "/activate", // activation page (token)
  "/reset-password", // reset page (token)
];

/** A path segment carries a secret when it looks like a long token/hash/JWT rather than an id/slug. */
function isSecretSegment(segment: string): boolean {
  if (segment.length < 20) return false;
  // JWT (three dot-separated base64url parts).
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(segment)) return true;
  // Long opaque hex / base64url token.
  if (/^[A-Fa-f0-9]{20,}$/.test(segment)) return true;
  if (/^[A-Za-z0-9_-]{32,}$/.test(segment)) return true;
  return false;
}

/** True only for a SUCCESSFUL read (GET/HEAD, 2xx) on a curated polling endpoint. */
export function shouldSilenceHttpSuccessLog(method: string, path: string, status: number): boolean {
  if (status < 200 || status >= 300) return false;
  const m = method.toUpperCase();
  if (m !== "GET" && m !== "HEAD") return false;
  return SILENCE_SUCCESS_PREFIXES.some((p) => path === p || path.startsWith(p));
}

/** True when the path is on a sensitive prefix (its token segments should be redacted). */
export function shouldRedactPath(path: string): boolean {
  return REDACT_PATH_PREFIXES.some((p) => path === p || path.startsWith(p));
}

/**
 * Rewrite token-like path segments and any `token`/`code`/`key` query values to `[redacted]`.
 * Safe to call on any path; a no-op when nothing looks sensitive.
 */
export function redactHttpPath(path: string): string {
  const [rawPath, rawQuery] = path.split("?", 2);
  const redactedPath = rawPath
    .split("/")
    .map((seg) => (isSecretSegment(seg) ? "[redacted]" : seg))
    .join("/");
  if (!rawQuery) return redactedPath;
  const query = rawQuery
    .split("&")
    .map((pair) => {
      const [k] = pair.split("=", 1);
      return /^(token|code|key|secret|access_token|refresh_token)$/i.test(k)
        ? `${k}=[redacted]`
        : pair;
    })
    .join("&");
  return `${redactedPath}?${query}`;
}

/** The combined decision for a request. `redactPath` is independent of status. */
export function httpLogPolicy(method: string, path: string, status: number): HttpLogDecision {
  return {
    silence: shouldSilenceHttpSuccessLog(method, path, status),
    redactPath: shouldRedactPath(path),
  };
}
