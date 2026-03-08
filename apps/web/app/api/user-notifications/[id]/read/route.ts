export const dynamic = "force-dynamic";

import { prisma } from "@/server/prisma";
import { resolveUserId } from "../../../_lib/resolve-session";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await resolveUserId(request);
    const { id } = await params;

    const notification = await prisma.userNotification.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!notification) return errorResponse("Notification not found", 404);
    if (notification.userId !== userId) return errorResponse("Forbidden", 403);

    await prisma.userNotification.update({
      where: { id },
      data: { status: "read", readAt: new Date() },
    });

    return successResponse({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
