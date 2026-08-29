import { notificationModel } from "@/server/models";
import { withAgent } from "../../_lib/with-agent";
import { successResponse, errorResponse } from "../../_lib/json-response";
import { validateBody, markDeliveredSchema } from "../../_lib/validation";

export const POST = withAgent(async (request, agent) => {
  const v = await validateBody(request, markDeliveredSchema);
  if (v.error) return v.error;

  // Support single id or array of ids
  const ids: string[] = v.data.ids ?? (v.data.id ? [v.data.id] : []);
  if (ids.length === 0) {
    return errorResponse("id or ids[] is required", 400);
  }

  // Only mark the calling agent's own notifications
  const result = await notificationModel.updateMany({
    where: { id: { in: ids }, mentionedAgentId: agent.id },
    data: { delivered: true, deliveredAt: new Date() },
  });

  return successResponse({ count: result.count });
});
