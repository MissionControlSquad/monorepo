export const dynamic = "force-dynamic";

import { upsertPushSubscription, deletePushSubscription } from "@agentcenter/database";
import { resolveUserId } from "../../_lib/resolve-session";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@/lib/feature-flag-keys";

export async function POST(request: Request) {
  try {
    const { userId } = await resolveUserId(request);

    if (!(await isFeatureEnabled(FLAG_KEYS.NOTIFICATIONS))) {
      return errorResponse("Notifications feature is not available on your current plan", 403);
    }
    const body = await request.json();

    const { endpoint, keys } = body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return errorResponse("Invalid push subscription", 400);
    }

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
    const body = await request.json();

    if (!body.endpoint) {
      return errorResponse("endpoint is required", 400);
    }

    await deletePushSubscription(userId, body.endpoint);

    return successResponse({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
