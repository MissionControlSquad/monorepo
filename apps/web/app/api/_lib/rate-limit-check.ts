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
  /** Cloud VM operations — expensive, tight limit */
  cloudVms: createRateLimiter({ max: 20, windowSec: 60, prefix: "rl:vms" }),
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
  const ip = getClientIp(request.headers);
  const check = await limiter.checkAsync(ip);
  if (!check.allowed) {
    return errorResponse("Too many requests. Try again later.", 429);
  }
  return null;
}
