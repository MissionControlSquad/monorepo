/**
 * GET /api/cron/cleanup-live-gateway
 *
 * Periodic cleanup for Live Gateway:
 * - Deletes used nonces older than 1 hour (replay window is 30s, so 1h is safe)
 * - Deletes expired PendingTaskDelivery rows
 *
 * Should be scheduled every hour via cron (e.g. Vercel Cron or system cron).
 */

import { NextResponse } from "next/server";
import { deleteExpiredNonces, deleteExpiredDeliveries } from "@agentcenter/database";
import { env } from "@/server/env";

const NONCE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const nonceCutoff = new Date(now.getTime() - NONCE_TTL_MS);

  const [noncesDeleted, deliveriesDeleted] = await Promise.all([
    deleteExpiredNonces(nonceCutoff),
    deleteExpiredDeliveries(now),
  ]);

  return NextResponse.json({
    ok: true,
    noncesDeleted,
    deliveriesDeleted,
    at: now.toISOString(),
  });
}
