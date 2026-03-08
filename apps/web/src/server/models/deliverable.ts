import type { Deliverable } from "@prisma/client";
import { prisma } from "../prisma";
import { emit } from "../events";
import { EventTypes } from "../constants";
import { Model } from "./base";

class DeliverableModel extends Model<Deliverable> {
  constructor() {
    super(() => prisma.deliverable);
  }

  async emitSubmitted(
    deliverable: Pick<Deliverable, "id" | "taskId" | "profileId" | "title" | "kind">,
    ctx: {
      taskNumber?: number;
      taskTitle: string;
      agentName: string;
      version?: number;
      isRevision?: boolean;
      agentId?: string;
    },
  ) {
    await emit({
      type: EventTypes.DELIVERABLE_SUBMITTED,
      deliverableId: deliverable.id,
      taskId: deliverable.taskId,
      profileId: deliverable.profileId,
      agentId: ctx.agentId,
      title: deliverable.title,
      kind: deliverable.kind,
      ...ctx,
    });
  }
}

export const deliverableModel = new DeliverableModel();
