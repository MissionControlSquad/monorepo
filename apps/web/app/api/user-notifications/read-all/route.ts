export const dynamic = "force-dynamic";

import { prisma } from "@/server/prisma";
import { resolveUserId } from "../../_lib/resolve-session";
import { successResponse, handleError } from "../../_lib/json-response";

export async function PATCH(request: Request) {
  try {
    const { userId } = await resolveUserId(request);

    const { count } = await prisma.userNotification.updateMany({
      where: { userId, channel: "in_app", readAt: null },
      data: { status: "read", readAt: new Date() },
    });

    return successResponse({ count });
  } catch (err) {
    return handleError(err);
  }
}
