import { notificationModel } from "@/server/models";
import { resolveAgent } from "../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const agent = await resolveAgent(request);

    // Support single id or array of ids
    const ids: string[] = body.ids ?? (body.id ? [body.id] : []);
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
