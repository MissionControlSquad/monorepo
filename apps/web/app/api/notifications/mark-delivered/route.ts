import { notificationModel } from "@/server/models";
import { resolveAgent } from "../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { validateBody, markDeliveredSchema } from "../../_lib/validation";

export async function POST(request: Request) {
  try {
    const v = await validateBody(request, markDeliveredSchema);
    if (v.error) return v.error;
    const agent = await resolveAgent(request);

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
  } catch (err) {
    return handleError(err);
  }
}
