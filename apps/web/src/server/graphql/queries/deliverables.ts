import { builder } from "../builder";
import { deliverableModel, deliverableVersionModel, taskModel } from "../../models";
import { getOrCreateAgentProfileId } from "../../agent-profile";

builder.queryField("deliverablesByTask", (t) =>
  t.prismaField({
    type: ["Deliverable"],
    args: { taskId: t.arg.string({ required: true }) },
    resolve: (query, _root, args) =>
      deliverableModel.findMany({
        ...query,
        where: { taskId: args.taskId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
  }),
);

builder.queryField("deliverablesByAgent", (t) =>
  t.prismaField({
    type: ["Deliverable"],
    args: {
      agentId: t.arg.string({ required: true }),
      projectId: t.arg.string(),
    },
    resolve: async (query, _root, args) => {
      const profileId = await getOrCreateAgentProfileId(args.agentId);
      return deliverableModel.findMany({
        ...query,
        where: {
          profileId,
          ...(args.projectId ? { projectId: args.projectId } : {}),
        },
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);

builder.queryField("deliverable", (t) =>
  t.prismaField({
    type: "Deliverable",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: (query, _root, args) => deliverableModel.findById(args.id, query),
  }),
);

builder.queryField("deliverableWithContext", (t) =>
  t.prismaField({
    type: "Deliverable",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: (query, _root, args) =>
      deliverableModel.delegate.findUnique({
        ...query,
        where: { id: args.id },
        include: { profile: true, task: true },
      }),
  }),
);

builder.queryField("deliverableVersions", (t) =>
  t.prismaField({
    type: ["DeliverableVersion"],
    args: { deliverableId: t.arg.string({ required: true }) },
    resolve: (query, _root, args) =>
      deliverableVersionModel.findMany({
        ...query,
        where: { deliverableId: args.deliverableId },
        orderBy: { version: "desc" },
      }),
  }),
);

builder.queryField("deliverablesByChildTasks", (t) =>
  t.field({
    type: ["JSON"],
    args: { parentTaskId: t.arg.string({ required: true }) },
    resolve: async (_root, args) => {
      const childTasks = await taskModel.findMany({
        where: { parentTaskId: args.parentTaskId },
        include: {
          deliverables: { include: { profile: true } },
          assignees: { include: { profile: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      return childTasks.map((task) => ({
        task: {
          id: task.id,
          title: task.title,
          taskNumber: task.taskNumber,
          status: task.status,
        },
        deliverables: task.deliverables,
        agents: task.assignees.map((a: any) => a.profile),
      }));
    },
  }),
);
