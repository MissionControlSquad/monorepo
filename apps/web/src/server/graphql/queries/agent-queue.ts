import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { agentQueueItemModel } from "../../models";
import { QueueItemStatus } from "../../constants";

builder.queryField("agentQueueByAgent", (t) =>
  t.prismaField({
    type: ["AgentQueueItem"],
    args: {
      agentId: t.arg.string({ required: true }),
      status: t.arg.string(),
    },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.AGENT_QUEUE);
      return agentQueueItemModel.findMany({
        ...query,
        where: {
          agentId: args.agentId,
          ...(args.status ? { status: args.status as any } : {}),
        },
        orderBy: { order: "asc" },
      });
    },
  }),
);

builder.queryField("agentQueueActive", (t) =>
  t.prismaField({
    type: ["AgentQueueItem"],
    args: { agentId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.AGENT_QUEUE);
      return agentQueueItemModel.findMany({
        ...query,
        where: {
          agentId: args.agentId,
          status: { in: [QueueItemStatus.PENDING, QueueItemStatus.IN_PROGRESS] },
        },
        orderBy: [{ status: "desc" }, { priority: "desc" }, { order: "asc" }],
      });
    },
  }),
);

builder.queryField("agentQueueByTask", (t) =>
  t.prismaField({
    type: ["AgentQueueItem"],
    args: { taskId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args) => {
      await requireFeature(FLAG_KEYS.AGENT_QUEUE);
      return agentQueueItemModel.findMany({
        ...query,
        where: { relatedTaskId: args.taskId },
        orderBy: { order: "asc" },
      });
    },
  }),
);
