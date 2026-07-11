import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { WatchdogCondition, WatchdogActionType, WatchdogScope } from "@agentcenter/database";
import { requireRole } from "@/server/tenancy";
import {
  proposeDecomposition,
  reviewDecomposition,
  applyDecomposition,
} from "@/server/services/plan-decomposition";
import { holdSubtree, releaseSubtreeHold } from "@/server/services/task-tree-hold";
import { createWatchdog, evaluateWatchdogs } from "@/server/services/task-watchdog";

// Epic #8: task-autonomy mutations. Proposing is member; reviewing/applying/holding/watchdogs are
// admin (the human review gate). Checkout itself is agent-only via REST (POST /api/tasks/checkout).

builder.mutationField("proposeDecomposition", (t) =>
  t.prismaField({
    type: "PlanDecomposition",
    args: {
      parentTaskId: t.arg.string({ required: true }),
      plan: t.arg({ type: "JSON", required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_AUTONOMY);
      requireRole(ctx, "member");
      const dec = await proposeDecomposition({ parentTaskId: args.parentTaskId, plan: args.plan });
      return ctx.prisma.planDecomposition.findUniqueOrThrow({ ...query, where: { id: dec.id } });
    },
  }),
);

builder.mutationField("reviewDecomposition", (t) =>
  t.prismaField({
    type: "PlanDecomposition",
    args: { id: t.arg.string({ required: true }), decision: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_AUTONOMY);
      const tenancy = requireRole(ctx, "admin");
      const dec = await reviewDecomposition({
        id: args.id,
        decision: args.decision === "approve" ? "approve" : "reject",
        reviewedByProfileId: tenancy.userId,
      });
      return ctx.prisma.planDecomposition.findUniqueOrThrow({ ...query, where: { id: dec.id } });
    },
  }),
);

builder.mutationField("applyDecomposition", (t) =>
  t.field({
    type: ["String"],
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_AUTONOMY);
      requireRole(ctx, "admin");
      const { taskIds } = await applyDecomposition(args.id);
      return taskIds;
    },
  }),
);

builder.mutationField("holdSubtree", (t) =>
  t.prismaField({
    type: "TaskTreeHold",
    args: {
      rootTaskId: t.arg.string({ required: true }),
      reason: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_AUTONOMY);
      const tenancy = requireRole(ctx, "admin");
      const hold = await holdSubtree(args.rootTaskId, args.reason, tenancy.userId);
      return ctx.prisma.taskTreeHold.findUniqueOrThrow({ ...query, where: { id: hold.id } });
    },
  }),
);

builder.mutationField("releaseSubtreeHold", (t) =>
  t.field({
    type: "Boolean",
    args: { rootTaskId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_AUTONOMY);
      requireRole(ctx, "admin");
      return releaseSubtreeHold(args.rootTaskId);
    },
  }),
);

builder.mutationField("createTaskWatchdog", (t) =>
  t.prismaField({
    type: "TaskWatchdog",
    args: {
      taskId: t.arg.string({ required: true }),
      condition: t.arg.string({ required: true }),
      thresholdSec: t.arg.int({ required: true }),
      action: t.arg.string({ required: true }),
      scope: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_AUTONOMY);
      requireRole(ctx, "admin");
      const wd = await createWatchdog({
        taskId: args.taskId,
        condition: args.condition as WatchdogCondition,
        thresholdSec: args.thresholdSec,
        action: args.action as WatchdogActionType,
        scope: (args.scope as WatchdogScope) ?? undefined,
      });
      return ctx.prisma.taskWatchdog.findUniqueOrThrow({ ...query, where: { id: wd.id } });
    },
  }),
);

// Manual watchdog sweep (the scheduled liveness cron is deferred). Returns decisions fired.
builder.mutationField("evaluateWatchdogsNow", (t) =>
  t.field({
    type: "Int",
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_AUTONOMY);
      requireRole(ctx, "admin");
      const decisions = await evaluateWatchdogs();
      return decisions.length;
    },
  }),
);
