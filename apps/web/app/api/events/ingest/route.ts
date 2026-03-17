import { NextResponse } from "next/server";
import { processEvent } from "@/server/events/ingest";
import { createRateLimiter } from "@/server/rate-limit";
import { log, logWarn } from "../../_lib/logger";
import { getClientIp } from "../../_lib/client-ip";

const ingestLimiter = createRateLimiter({ max: 120, windowSec: 60 });

/**
 * POST /api/events/ingest
 * Body: JSON event payload (same schema as GraphQL ingestEvent mutation)
 *
 * Auth: Bearer token in Authorization header (required).
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    const check = ingestLimiter.check(ip);
    if (!check.allowed) {
      logWarn("events/ingest", `Rate limited: ip=${ip}`, request);
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(check.retryAfterSec) } },
      );
    }
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authorization: Bearer <api_key> header is required" },
        { status: 401 },
      );
    }

    const apiKey = authHeader.slice(7);
    const event = await request.json();

    if (!event.type) {
      return NextResponse.json({ error: "event.type is required" }, { status: 400 });
    }

    const result = await processEvent(event, apiKey);

    log("events/ingest", `OK type=${event.type}`, request);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isAuthError = message.includes("not found") || message.includes("Invalid");
    const status = isAuthError ? 401 : 500;
    console.error("[events/ingest] Error:", message);
    return NextResponse.json(
      { error: isAuthError ? "Authentication failed" : "Internal server error" },
      { status },
    );
  }
}
