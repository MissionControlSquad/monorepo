import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";

// Tier C: typed task dependency graph reads. TASK_RELATIONS-gated. Returns every relation touching
// the task in either direction (as source or target).
builder.queryField("taskRelations", (t) =>
  t.prismaField({
    type: ["TaskRelation"],
    args: { taskId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_RELATIONS);
      return ctx.prisma.taskRelation.findMany({
        ...query,
        where: { OR: [{ sourceTaskId: args.taskId }, { targetTaskId: args.taskId }] },
        orderBy: { createdAt: "asc" },
      });
    },
  }),
);
