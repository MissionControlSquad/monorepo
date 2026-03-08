import { NextRequest, NextResponse } from "next/server";
import { invalidateFlagCache } from "@/server/feature-flags";
import { pubsub, PubSubEvent } from "@/server/pubsub";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  invalidateFlagCache();
  pubsub.publish(PubSubEvent.FEATURE_FLAGS.CHANGED, {});

  return NextResponse.json({ ok: true });
}
