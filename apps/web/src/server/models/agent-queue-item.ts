import type { AgentQueueItem } from "@prisma/client";
import { prisma } from "../prisma";
import { emit } from "../events";
import { EventTypes } from "../constants";
import { Model } from "./base";

class AgentQueueItemModel extends Model<AgentQueueItem> {
  constructor() {
    super(() => prisma.agentQueueItem);
  }

  async emitItemCreated(
    item: Pick<AgentQueueItem, "id" | "agentId" | "title" | "relatedTaskId">,
    ctx: { agentName: string },
  ) {
    await emit({
      type: EventTypes.QUEUE_ITEM_CREATED,
      queueItemId: item.id,
      agentId: item.agentId,
      title: item.title,
      relatedTaskId: item.relatedTaskId ?? undefined,
      ...ctx,
    });
  }

  async emitItemStatusChanged(
    item: Pick<AgentQueueItem, "id" | "agentId" | "title" | "relatedTaskId">,
    ctx: { agentName: string; newStatus: string },
  ) {
    await emit({
      type: EventTypes.QUEUE_ITEM_STATUS_CHANGED,
      queueItemId: item.id,
      agentId: item.agentId,
      title: item.title,
      relatedTaskId: item.relatedTaskId ?? undefined,
      ...ctx,
    });
  }
}

export const agentQueueItemModel = new AgentQueueItemModel();
