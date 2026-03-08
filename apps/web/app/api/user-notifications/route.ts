export const dynamic = "force-dynamic";

import { prisma } from "@/server/prisma";
import { resolveUserId } from "../_lib/resolve-session";
import { successResponse, handleError } from "../_lib/json-response";

export async function GET(request: Request) {
  try {
    const { userId } = await resolveUserId(request);
    const { searchParams } = new URL(request.url);

    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 100);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);
    const status = searchParams.get("status"); // pending | sent | read
    const channel = searchParams.get("channel"); // in_app | push | email

    const where: Record<string, unknown> = { userId };
    // Only show in_app notifications by default in the list
    where.channel = channel ?? "in_app";
    if (status) where.status = status;

    const [notifications, total] = await Promise.all([
      prisma.userNotification.findMany({
        where,
        select: {
          id: true,
          type: true,
          channel: true,
          status: true,
          title: true,
          body: true,
          taskId: true,
          url: true,
          readAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.userNotification.count({ where }),
    ]);

    return successResponse({ notifications, total });
  } catch (err) {
    return handleError(err);
  }
}
