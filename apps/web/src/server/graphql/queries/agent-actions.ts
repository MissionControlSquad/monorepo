import { builder } from "../builder";
import { agentActionModel } from "../../models";

builder.queryField("agentActionsByAgent", (t) =>
  t.prismaField({
    type: ["AgentAction"],
    args: {
      agentId: t.arg.string({ required: true }),
      limit: t.arg.int({ defaultValue: 50 }),
      projectId: t.arg.string(),
    },
    resolve: (query, _root, args) =>
      agentActionModel.findMany({
        ...query,
        where: {
          agentId: args.agentId,
          ...(args.projectId ? { projectId: args.projectId } : {}),
        },
        orderBy: { timestamp: "desc" },
        take: args.limit ?? 50,
      }),
  }),
);

builder.queryField("agentActionsByTask", (t) =>
  t.prismaField({
    type: ["AgentAction"],
    args: {
      taskId: t.arg.string({ required: true }),
      limit: t.arg.int({ defaultValue: 50 }),
    },
    resolve: (query, _root, args) =>
      agentActionModel.findMany({
        ...query,
        where: { taskId: args.taskId },
        orderBy: { timestamp: "desc" },
        take: args.limit ?? 50,
      }),
  }),
);

builder.queryField("liveActivity", (t) =>
  t.prismaField({
    type: ["AgentAction"],
    args: {
      limit: t.arg.int({ defaultValue: 100 }),
      projectId: t.arg.string(),
    },
    resolve: (query, _root, args) =>
      agentActionModel.findMany({
        ...query,
        where: args.projectId ? { projectId: args.projectId } : {},
        orderBy: { timestamp: "desc" },
        take: args.limit ?? 100,
      }),
  }),
);

builder.queryField("currentAgentActivity", (t) =>
  t.prismaField({
    type: "AgentAction",
    nullable: true,
    args: { agentId: t.arg.string({ required: true }) },
    resolve: (query, _root, args) =>
      agentActionModel.findOne({
        ...query,
        where: { agentId: args.agentId },
        orderBy: { timestamp: "desc" },
      }),
  }),
);
