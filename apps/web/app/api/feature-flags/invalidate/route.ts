import { successResponse } from "../../_lib/json-response";
import { withCronAuth } from "../../_lib/with-cron-auth";
import { invalidateFlagCache } from "@/server/feature-flags";
import { pubsub, PubSubEvent } from "@/server/pubsub";

// CRON_SECRET-gated internal endpoint (called after a plan/flag change) — auth via the shared
// withCronAuth HOC instead of a hand-copied bearer check.
export const POST = withCronAuth(async () => {
  invalidateFlagCache();
  pubsub.publish(PubSubEvent.FEATURE_FLAGS.CHANGED, {});
  return successResponse({ ok: true });
});
