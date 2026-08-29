/**
 * GET /api/cron/cleanup-live-gateway
 *
 * Hourly maintenance for the Live Gateway:
 * - Deletes used nonces older than 1 hour (replay window is 30s, 1h is safe)
 * - Deletes expired LivePendingDelivery rows (24h TTL)
 *
 * Registered in vercel.json as: { "path": "/api/cron/cleanup-live-gateway", "schedule": "0 * * * *" }
 */

import { successResponse } from "../../_lib/json-response";
import { deleteExpiredNonces, deleteExpiredDeliveries } from "@agentcenter/database";
import { withCronAuth } from "../../_lib/with-cron-auth";

export const GET = withCronAuth(async () => {
  const [noncesDeleted, deliveriesDeleted] = await Promise.all([
    deleteExpiredNonces(),
    deleteExpiredDeliveries(),
  ]);

  return successResponse({
    ok: true,
    noncesDeleted,
    deliveriesDeleted,
    at: new Date().toISOString(),
  });
});
