import { builder } from "../builder";
import { agentModel, taskModel } from "../../models";
import { Roles, TaskStatus } from "../../constants";

builder.queryField("tasksPendingReview", (t) =>
  t.prismaField({
    type: ["Task"],
    args: {
      agentId: t.arg.string({ required: true }),
      projectId: t.arg.string(),
    },
    resolve: async (query, _root, args) => {
      const agent = await agentModel.findById(args.agentId);
      if (!agent || agent.role !== Roles.SQUAD_LEAD) return [];

      return taskModel.findMany({
        ...query,
        where: {
          status: TaskStatus.REVIEW,
          ...(args.projectId ? { projectId: args.projectId } : {}),
        },
        include: {
          assignees: { include: { profile: true } },
          documents: true,
          messages: { orderBy: { createdAt: "desc" }, take: 5 },
        },
        orderBy: { updatedAt: "asc" },
      });
    },
  }),
);
