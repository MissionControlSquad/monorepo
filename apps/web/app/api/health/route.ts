import { NextResponse } from "next/server";
import { pingDatabase, getNotificationHealthStats } from "@agentcenter/database";
import { getRedisClient } from "@/server/redis";
import { getMetrics } from "@/server/services/notification-metrics";

type CheckStatus = "pass" | "fail" | "skip";

interface CheckResult {
  status: CheckStatus;
  latencyMs?: number;
  error?: string;
  [key: string]: unknown;
}

export async function GET() {
  const checks: Record<string, CheckResult> = {};

  // --- Database ---
  try {
    const start = performance.now();
    const ok = await pingDatabase();
    if (ok) {
      checks.database = { status: "pass", latencyMs: Math.round(performance.now() - start) };
    } else {
      checks.database = { status: "fail", error: "connection_failed" };
    }
  } catch (err) {
    checks.database = { status: "fail", error: "connection_failed" };
  }

  // --- Redis ---
  try {
    const redis = getRedisClient();
    if (!redis) {
      checks.redis = { status: "skip" };
    } else {
      const start = performance.now();
      await redis.ping();
      checks.redis = { status: "pass", latencyMs: Math.round(performance.now() - start) };
    }
  } catch (err) {
    checks.redis = { status: "fail", error: "connection_failed" };
  }

  // --- Retry Queue ---
  try {
    const { failedCount: pendingRetries, deadCount: deadLettered } =
      await getNotificationHealthStats();
    checks.retryQueue = { status: "pass", pendingRetries, deadLettered };
  } catch (err) {
    checks.retryQueue = { status: "fail", error: "query_failed" };
  }

  // --- Notification Metrics ---
  try {
    const metrics = getMetrics();
    checks.notifications = { status: "pass", ...metrics };
  } catch {
    checks.notifications = { status: "skip" };
  }

  // --- Status Logic ---
  const dbFailed = checks.database.status === "fail";
  const redisFailed = checks.redis.status === "fail";

  let status: "healthy" | "degraded" | "unhealthy";
  if (dbFailed) {
    status = "unhealthy";
  } else if (redisFailed) {
    status = "degraded";
  } else {
    status = "healthy";
  }

  const body = {
    status,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks,
  };

  return NextResponse.json(body, {
    status: status === "unhealthy" ? 503 : 200,
    headers: { "Cache-Control": "no-cache" },
  });
}
