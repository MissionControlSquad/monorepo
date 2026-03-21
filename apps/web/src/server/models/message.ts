import type { Message } from "@agentcenter/database";
import { messageDelegate } from "@agentcenter/database";
import { emit } from "../events";
import { EventTypes } from "../constants";
import { Model } from "./base";

class MessageModel extends Model<Message> {
  constructor() {
    super(messageDelegate);
  }

  async emitCreated(
    message: Pick<Message, "id" | "taskId" | "fromProfileId" | "content">,
    ctx: {
      taskNumber?: number;
      taskTitle: string;
      fromAgentName: string;
      fromProfileId: string;
      fromAgentId?: string;
      mentionedAgentIds: string[];
    },
  ) {
    await emit({
      type: EventTypes.MESSAGE_CREATED,
      messageId: message.id,
      taskId: message.taskId,
      fromProfileId: ctx.fromProfileId,
      fromAgentId: ctx.fromAgentId,
      content: message.content,
      taskNumber: ctx.taskNumber,
      taskTitle: ctx.taskTitle,
      fromAgentName: ctx.fromAgentName,
      mentionedAgentIds: ctx.mentionedAgentIds,
    });
  }
}

export const messageModel = new MessageModel();
