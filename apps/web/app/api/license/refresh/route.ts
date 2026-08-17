export const dynamic = "force-dynamic";

import { forceTokenRefresh, invalidateLicenseCache } from "@/server/license";
import { createRateLimiter } from "@/server/rate-limit";
import { checkRateLimit } from "../../_lib/rate-limit-check";
import { successResponse, errorResponse } from "../../_lib/json-response";
import { withCronAuth } from "../../_lib/with-cron-auth";

/** License refresh — moderate limit (internal, but still bounded) */
const refreshLimiter = createRateLimiter({ max: 10, windowSec: 60, prefix: "rl:lic:refresh" });

/** CRON_SECRET-gated refresh body (auth via the shared withCronAuth HOC). */
const refresh = withCronAuth(async () => {
  try {
    const result = await forceTokenRefresh();
    invalidateLicenseCache();
    return successResponse(result);
  } catch {
    return errorResponse("Refresh failed", 500);
  }
});

/**
 * POST /api/license/refresh
 * Triggers an immediate token refresh.
 * Called by infra dashboard after plan changes.
 * Authenticated via CRON_SECRET (same internal secret used by cron jobs). Rate-limited BEFORE auth so
 * an unauthenticated flood is bounded, then delegated to the withCronAuth-gated handler.
 */
export async function POST(request: Request) {
  const blocked = await checkRateLimit(refreshLimiter, request);
  if (blocked) return blocked;
  return refresh(request, undefined as never);
}
