export const dynamic = "force-dynamic";

import { forceTokenRefresh, invalidateLicenseCache } from "@/server/license";
import { createRateLimiter } from "@/server/rate-limit";
import { checkRateLimit } from "../../_lib/rate-limit-check";

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
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await forceTokenRefresh();
    invalidateLicenseCache();
    return Response.json(result);
  } catch {
    return Response.json({ success: false, message: "Refresh failed" }, { status: 500 });
  }
}
