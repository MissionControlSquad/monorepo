export const dynamic = "force-dynamic";

import { notificationModel } from "@/server/models";
import { withAgent } from "../_lib/with-agent";
import { successResponse } from "../_lib/json-response";
import { parsePaginationParams } from "../_lib/pagination";
import { generateDueDateReminders } from "@/server/due-date-reminders";

export const GET = withAgent(async (request, agent) => {
  const { searchParams } = new URL(request.url);

  await generateDueDateReminders(agent.id);
  const includeDelivered = searchParams.get("includeDelivered") === "true";

  const where: Record<string, unknown> = {
    mentionedAgentId: agent.id,
  };
  if (!includeDelivered) {
    where.delivered = false;
  }

  const { limit, offset } = parsePaginationParams(searchParams, {
    defaultLimit: 100,
    maxLimit: 500,
  });

  const notifications = await notificationModel.findMany({
    where,
    include: {
      task: { select: { id: true, title: true, taskNumber: true } },
      message: { select: { id: true, content: true, fromProfileId: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  return successResponse(notifications);
});
