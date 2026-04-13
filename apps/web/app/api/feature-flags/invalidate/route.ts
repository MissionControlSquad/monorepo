import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "../../_lib/json-response";
import { invalidateFlagCache } from "@/server/feature-flags";
import { pubsub, PubSubEvent } from "@/server/pubsub";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return errorResponse("Unauthorized", 401);
  }

  invalidateFlagCache();
  pubsub.publish(PubSubEvent.FEATURE_FLAGS.CHANGED, {});

  return successResponse({ ok: true });
}
