import { builder } from "../builder";
import { recurringTaskModel } from "../../models";
import { getOrCreateAgentProfileId } from "../../agent-profile";

builder.queryField("recurringTasks", (t) =>
  t.prismaField({
    type: ["RecurringTask"],
    args: {
      projectId: t.arg.string(),
      includeInactive: t.arg.boolean({ defaultValue: false }),
    },
    resolve: (query, _root, args) => {
      const where: Record<string, unknown> = {};
      if (args.projectId) where.projectId = args.projectId;
      if (!args.includeInactive) where.isActive = true;

      return recurringTaskModel.findMany({
        ...query,
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    },
  }),
);

builder.queryField("recurringTask", (t) =>
  t.prismaField({
    type: "RecurringTask",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: (query, _root, args) => recurringTaskModel.findById(args.id, query),
  }),
);

builder.queryField("recurringTasksByAssignee", (t) =>
  t.prismaField({
    type: ["RecurringTask"],
    args: {
      agentId: t.arg.string({ required: true }),
      projectId: t.arg.string(),
      includeInactive: t.arg.boolean({ defaultValue: false }),
    },
    resolve: async (query, _root, args) => {
      const profileId = await getOrCreateAgentProfileId(args.agentId);
      const where: Record<string, unknown> = {
        assignees: { some: { profileId } },
      };
      if (args.projectId) where.projectId = args.projectId;
      if (!args.includeInactive) where.isActive = true;

      return recurringTaskModel.findMany({
        ...query,
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    },
  }),
);
