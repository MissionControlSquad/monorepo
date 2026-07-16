import { createRateLimiter } from "@/server/rate-limit";
import { errorResponse } from "./json-response";
import { getClientIp } from "./client-ip";

/**
 * Pre-configured rate limiters for different API route groups.
 *
 * When REDIS_URL is set, rate limits are shared across processes via Redis.
 * Otherwise falls back to in-memory per-process counters.
 */
export const apiLimiters = {
  /** GraphQL endpoint — generous but bounded */
  graphql: createRateLimiter({ max: 200, windowSec: 60, prefix: "rl:gql" }),
  /** Task CRUD — agents create/update tasks frequently */
  tasks: createRateLimiter({ max: 120, windowSec: 60, prefix: "rl:tasks" }),
  /** Message posting */
  messages: createRateLimiter({ max: 60, windowSec: 60, prefix: "rl:msgs" }),
  /** Channel operations */
  channels: createRateLimiter({ max: 60, windowSec: 60, prefix: "rl:chan" }),
  /** Live gateway install token management — very sensitive, strict limit */
  liveGatewayTokens: createRateLimiter({ max: 10, windowSec: 60, prefix: "rl:lgtok" }),
  /** Live gateway connections list — polled by sidebar + page every 15-30s */
  liveGatewayConnections: createRateLimiter({ max: 120, windowSec: 60, prefix: "rl:lgconn" }),
  /** Storage uploads */
  storage: createRateLimiter({ max: 30, windowSec: 60, prefix: "rl:store" }),
};

/**
 * Check the rate limit for a request. Returns an error response if
 * the limit is exceeded, or null if the request is allowed.
 *
 * Uses Redis when available (shared across processes), otherwise in-memory.
 */
export async function checkRateLimit(
  limiter: ReturnType<typeof createRateLimiter>,
  request: Request,
): Promise<Response | null> {
  // Disabled under test. The limiters are module-level (and Redis-backed when REDIS_URL is set),
  // keyed by a single shared client IP, so their counters accumulate across every test file in the
  // suite and trip non-deterministically — surfacing as whole files failing with 429 (a body of
  // `{error}` not `{errors}`, so tests that assert `!errors` then read `data` see undefined). Real
  // requests still get rate limited in dev/prod.
  if (process.env.VITEST || process.env.NODE_ENV === "test") return null;

  const ip = getClientIp(request.headers);
  const check = await limiter.checkAsync(ip);
  if (!check.allowed) {
    return errorResponse("Too many requests. Try again later.", 429, "RATE_LIMITED");
  }
  return null;
}
