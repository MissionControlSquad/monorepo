import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS, computeBlockerDiagnostics } from "@agentcenter/utils";

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

// Domain 8 G6.1: "Why is this blocked?" — readiness + reasons from the task's blockers (the direct
// blockedByTaskId edge + typed `blocks` relations). TASK_RELATIONS-gated.
const BlockerDetail = builder.simpleObject("BlockerDetail", {
  fields: (t) => ({
    taskId: t.string(),
    status: t.string(),
    source: t.string(),
    resolved: t.boolean(),
  }),
});

const BlockerDiagnostics = builder.simpleObject("BlockerDiagnostics", {
  fields: (t) => ({
    readiness: t.string(),
    unresolvedCount: t.int(),
    reasons: t.stringList(),
    blockers: t.field({ type: [BlockerDetail] }),
  }),
});

builder.queryField("blockerDiagnostics", (t) =>
  t.field({
    type: BlockerDiagnostics,
    args: { taskId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_RELATIONS);
      const task = await ctx.prisma.task.findUnique({
        where: { id: args.taskId },
        select: { blockedByTaskId: true },
      });
      // Blockers via typed `blocks` relations (source blocks this task).
      const relations = await ctx.prisma.taskRelation.findMany({
        where: { targetTaskId: args.taskId, type: "blocks" },
        select: { sourceTaskId: true },
      });
      const blockerIds = new Set<string>();
      const sources = new Map<string, "blocked_by" | "relation">();
      if (task?.blockedByTaskId) {
        blockerIds.add(task.blockedByTaskId);
        sources.set(task.blockedByTaskId, "blocked_by");
      }
      for (const r of relations) {
        blockerIds.add(r.sourceTaskId);
        if (!sources.has(r.sourceTaskId)) sources.set(r.sourceTaskId, "relation");
      }
      const blockerTasks = blockerIds.size
        ? await ctx.prisma.task.findMany({
            where: { id: { in: [...blockerIds] } },
            select: { id: true, status: true },
          })
        : [];
      return computeBlockerDiagnostics(
        blockerTasks.map((b) => ({
          taskId: b.id,
          status: b.status,
          source: sources.get(b.id) ?? "relation",
        })),
      );
    },
  }),
);
