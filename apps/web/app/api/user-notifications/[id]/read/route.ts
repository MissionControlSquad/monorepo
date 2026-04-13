export const dynamic = "force-dynamic";

import { getUserNotificationOwnerId, markUserNotificationRead } from "@agentcenter/database";
import { resolveUserId } from "../../../_lib/resolve-session";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await resolveUserId(request);
    const { id } = await params;

    const ownerId = await getUserNotificationOwnerId(id);

    if (!ownerId) return errorResponse(ERR.NOTIFICATION_NOT_FOUND, 404);
    if (ownerId !== userId) return errorResponse("Forbidden", 403);

    await markUserNotificationRead(id);

    return successResponse({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
