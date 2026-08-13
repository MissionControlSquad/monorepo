import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { requireRole } from "@/server/tenancy/guards";
import { FLAG_KEYS } from "@agentcenter/utils";
import { GraphQLError } from "graphql";
import { linkTasks, unlinkTasks, isTaskRelationType } from "@/server/services/task-relations";

// Tier C: typed task dependency graph writes. TASK_RELATIONS-gated (tasks are always-on; the graph
// is a new capability behind its own flag).
builder.mutationField("linkTasks", (t) =>
  t.prismaField({
    type: "TaskRelation",
    args: {
      sourceTaskId: t.arg.string({ required: true }),
      targetTaskId: t.arg.string({ required: true }),
      type: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_RELATIONS);
      requireRole(ctx, "member");
      if (!isTaskRelationType(args.type))
        throw new GraphQLError(`Invalid relation type '${args.type}'`, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      const rel = await linkTasks({
        sourceTaskId: args.sourceTaskId,
        targetTaskId: args.targetTaskId,
        type: args.type,
        createdByProfileId: ctx.session?.profileId ?? null,
      });
      return ctx.prisma.taskRelation.findUniqueOrThrow({ ...query, where: { id: rel.id } });
    },
  }),
);

builder.mutationField("unlinkTasks", (t) =>
  t.field({
    type: "Boolean",
    args: { relationId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_RELATIONS);
      requireRole(ctx, "member");
      return unlinkTasks(args.relationId);
    },
  }),
);
