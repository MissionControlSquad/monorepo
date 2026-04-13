export const dynamic = "force-dynamic";

import { forceTokenRefresh, invalidateLicenseCache } from "@/server/license";
import { createRateLimiter } from "@/server/rate-limit";
import { checkRateLimit } from "../../_lib/rate-limit-check";
import { successResponse, errorResponse } from "../../_lib/json-response";
import { env } from "@/server/env";

/** License refresh — moderate limit (internal, but still bounded) */
const refreshLimiter = createRateLimiter({ max: 10, windowSec: 60, prefix: "rl:lic:refresh" });

/**
 * POST /api/license/refresh
 * Triggers an immediate token refresh.
 * Called by infra dashboard after plan changes.
 * Authenticated via CRON_SECRET (same internal secret used by cron jobs).
 */
export async function POST(request: Request) {
  const blocked = await checkRateLimit(refreshLimiter, request);
  if (blocked) return blocked;

  const authHeader = request.headers.get("authorization");

  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const result = await forceTokenRefresh();
    invalidateLicenseCache();
    return successResponse(result);
  } catch {
    return errorResponse("Refresh failed", 500);
  }
}
