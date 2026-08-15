import { messageModel, messageReactionModel } from "@/server/models";
import { pubsub, messageReactionTopic } from "@/server/pubsub";
import { withAgent } from "../../../_lib/with-agent";
import { successResponse, assertFound } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { validateBody, messageReactionSchema } from "../../../_lib/validation";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";

export const POST = withAgent(
  async (request, agent, { params }: { params: Promise<{ id: string }> }) => {
    const { id: messageId } = await params;
    const v = await validateBody(request, messageReactionSchema);
    if (v.error) return v.error;
    const { emoji } = v.data;

    const message = await messageModel.findById(messageId, {
      select: { id: true, taskId: true },
    });
    assertFound(message, ERR.MESSAGE_NOT_FOUND);

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
  },
);
