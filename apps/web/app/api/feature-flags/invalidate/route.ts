import type { NextRequest } from "next/server";
import { successResponse, errorResponse } from "../../_lib/json-response";
import { invalidateFlagCache } from "@/server/feature-flags";
import { pubsub, PubSubEvent } from "@/server/pubsub";
import { env } from "@/server/env";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return errorResponse("Unauthorized", 401);
  }

  invalidateFlagCache();
  pubsub.publish(PubSubEvent.FEATURE_FLAGS.CHANGED, {});

  return successResponse({ ok: true });
}
