import { messageModel, messageReactionModel } from "@/server/models";
import { pubsub, messageReactionTopic } from "@/server/pubsub";
import { resolveAgent } from "../../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { validateBody, messageReactionSchema } from "../../../_lib/validation";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: messageId } = await params;
    const v = await validateBody(request, messageReactionSchema);
    if (v.error) return v.error;
    const agent = await resolveAgent(request);
    const { emoji } = v.data;

    const message = await messageModel.findById(messageId, {
      select: { id: true, taskId: true },
    });
    if (!message) {
      return errorResponse("Message not found", 404);
    }

    const profileId = await getOrCreateAgentProfileId(agent.id);
    const existing = await messageReactionModel.findOne({
      where: {
        messageId,
        profileId,
        emoji,
      },
    });

    let action: "added" | "removed";
    if (existing) {
      await messageReactionModel.deleteById(existing.id);
      action = "removed";
    } else {
      await messageReactionModel.create({
        data: { messageId, profileId, emoji },
      });
      action = "added";
    }

    pubsub.publish(messageReactionTopic(message.taskId), {
      taskId: message.taskId,
      messageId: message.id,
    });

    return successResponse({ messageId, emoji, action });
  } catch (err) {
    return handleError(err);
  }
}
