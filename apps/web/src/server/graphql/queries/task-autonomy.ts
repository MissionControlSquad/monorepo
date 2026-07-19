import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { DecompositionStatus } from "@agentcenter/database";
import { requireRole } from "@/server/tenancy";

// Epic #8: task-autonomy reads — TASK_AUTONOMY-gated, member+. Tasks are not workspace-scoped
// (they scope via project), so these mirror the existing non-scoped task lifecycle queries.
builder.queryField("pendingDecompositions", (t) =>
  t.prismaField({
    type: ["PlanDecomposition"],
    args: { status: t.arg.string() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_AUTONOMY);
      requireRole(ctx, "member");
      return ctx.prisma.planDecomposition.findMany({
        ...query,
        where: args.status
          ? { status: args.status as DecompositionStatus }
          : { status: { in: ["proposed", "approved"] } },
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);

builder.queryField("taskTreeHolds", (t) =>
  t.prismaField({
    type: ["TaskTreeHold"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_AUTONOMY);
      requireRole(ctx, "member");
      return ctx.prisma.taskTreeHold.findMany({
        ...query,
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);

builder.queryField("taskRecoveryActions", (t) =>
  t.prismaField({
    type: ["TaskRecoveryAction"],
    args: { limit: t.arg.int() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_AUTONOMY);
      requireRole(ctx, "member");
      return ctx.prisma.taskRecoveryAction.findMany({
        ...query,
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(args.limit ?? 50, 1), 200),
      });
    },
  }),
);

// Domain 8 G6.5: typed thread interactions on a task. THREAD_INTERACTIONS-gated, member+.
builder.queryField("threadInteractions", (t) =>
  t.prismaField({
    type: ["TaskThreadInteraction"],
    args: { taskId: t.arg.string({ required: true }), status: t.arg.string() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.THREAD_INTERACTIONS);
      requireRole(ctx, "member");
      return ctx.prisma.taskThreadInteraction.findMany({
        ...query,
        where: { taskId: args.taskId, ...(args.status ? { status: args.status } : {}) },
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);
