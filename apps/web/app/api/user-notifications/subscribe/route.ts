export const dynamic = "force-dynamic";

import { upsertPushSubscription, deletePushSubscription } from "@agentcenter/database";
import { resolveUserId } from "../../_lib/resolve-session";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { validateBody, pushSubscribeSchema, pushUnsubscribeSchema } from "../../_lib/validation";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";

export async function POST(request: Request) {
  try {
    const { userId } = await resolveUserId(request);

    if (!(await isFeatureEnabled(FLAG_KEYS.NOTIFICATIONS))) {
      return errorResponse("Notifications feature is not available on your current plan", 403);
    }
    const v = await validateBody(request, pushSubscribeSchema);
    if (v.error) return v.error;
    const { endpoint, keys } = v.data;

    await upsertPushSubscription({
      userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return successResponse({ success: true }, 201);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await resolveUserId(request);
    const v = await validateBody(request, pushUnsubscribeSchema);
    if (v.error) return v.error;

    await deletePushSubscription(userId, v.data.endpoint);

    return successResponse({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
