export const dynamic = "force-dynamic";

import { getUserNotificationOwnerId, markUserNotificationRead } from "@agentcenter/database";
import { resolveUserId } from "../../../_lib/resolve-session";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await resolveUserId(request);
    const { id } = await params;

    const ownerId = await getUserNotificationOwnerId(id);

    if (!ownerId) return errorResponse("Notification not found", 404);
    if (ownerId !== userId) return errorResponse("Forbidden", 403);

    await markUserNotificationRead(id);

    return successResponse({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
