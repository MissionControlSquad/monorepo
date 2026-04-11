import { checkRateLimit } from "./rate-limit-check";
import type { createRateLimiter } from "@/server/rate-limit";

type RouteHandler<C = unknown> = (request: Request, ctx: C) => Promise<Response>;

/**
 * Wraps a Next.js App Router handler with a rate limit gate.
 * Returns 429 RATE_LIMITED immediately if the limit is exceeded.
 *
 * Compose with withFeature (rate limit runs first — cheaper check):
 *   export const GET = withRateLimit(apiLimiters.liveGatewayTokens, withFeature(FLAG_KEYS.X, getHandler));
 */
export function withRateLimit<C = unknown>(
  limiter: ReturnType<typeof createRateLimiter>,
  handler: RouteHandler<C>,
): RouteHandler<C> {
  return async (request, ctx) => {
    const limited = await checkRateLimit(limiter, request);
    if (limited) return limited;
    return handler(request, ctx);
  };
}
