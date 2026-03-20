export const dynamic = "force-dynamic";

import { markAllUserNotificationsRead } from "@agentcenter/database";
import { resolveUserId } from "../../_lib/resolve-session";
import { successResponse, handleError } from "../../_lib/json-response";

export async function PATCH(request: Request) {
  try {
    const { userId } = await resolveUserId(request);

    await markAllUserNotificationsRead(userId);

    return successResponse({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
