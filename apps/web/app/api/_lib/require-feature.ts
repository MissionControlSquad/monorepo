import { isFeatureEnabled } from "@/server/feature-flags";
import { errorResponse } from "./json-response";
import type { FlagKey } from "@agentcenter/utils";

type RouteHandler<C = unknown> = (request: Request, ctx: C) => Promise<Response>;

/**
 * Wraps a Next.js App Router handler with a feature flag gate.
 * Returns 403 FEATURE_DISABLED immediately if the flag is off.
 *
 * Usage:
 *   export const GET = withFeature(FLAG_KEYS.LIVE_GATEWAY, async (request) => { ... });
 */
export function withFeature<C = unknown>(flag: FlagKey, handler: RouteHandler<C>): RouteHandler<C> {
  return async (request, ctx) => {
    if (!(await isFeatureEnabled(flag))) {
      return errorResponse("This feature is not enabled on your plan", 403, "FEATURE_DISABLED");
    }
    return handler(request, ctx);
  };
}
