export const dynamic = "force-dynamic";

import { prisma } from "@/server/prisma";
import { resolveUserId } from "../../_lib/resolve-session";
import { successResponse, handleError } from "../../_lib/json-response";

export async function GET(request: Request) {
  try {
    const { userId } = await resolveUserId(request);

    const count = await prisma.userNotification.count({
      where: { userId, channel: "in_app", readAt: null },
    });

    return successResponse({ count });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      (err as { status: number }).status === 404
    ) {
      return successResponse({ count: 0 });
    }
    return handleError(err);
  }
}
