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
import { armTaskMonitor, clearTaskMonitor } from "@/server/services/task-monitors";
import {
  createThreadInteraction,
  resolveThreadInteraction,
} from "@/server/services/thread-interactions";
import { GraphQLError } from "graphql";

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

// Domain 9 #11: arm a one-shot "check back later" monitor on a task. member+, TASK_AUTONOMY-gated.
builder.mutationField("armTaskMonitor", (t) =>
  t.prismaField({
    type: "Task",
    args: {
      taskId: t.arg.string({ required: true }),
      nextCheckAt: t.arg({ type: "DateTime", required: true }),
      notes: t.arg.string(),
      maxAttempts: t.arg.int(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_AUTONOMY);
      requireRole(ctx, "member");
      if (args.maxAttempts != null && args.maxAttempts < 1)
        throw new GraphQLError("maxAttempts must be >= 1", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      await armTaskMonitor({
        taskId: args.taskId,
        nextCheckAt: args.nextCheckAt,
        notes: args.notes ?? null,
        maxAttempts: args.maxAttempts ?? null,
      });
      return ctx.prisma.task.findUniqueOrThrow({ ...query, where: { id: args.taskId } });
    },
  }),
);

builder.mutationField("clearTaskMonitor", (t) =>
  t.field({
    type: "Boolean",
    args: { taskId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.TASK_AUTONOMY);
      requireRole(ctx, "member");
      await clearTaskMonitor(args.taskId);
      return true;
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

// Domain 8 G6.5: create + resolve typed thread interactions. Create is member+ (an agent posts an
// ask); resolving/dismissing is member+ (a human decides). THREAD_INTERACTIONS-gated.
builder.mutationField("createThreadInteraction", (t) =>
  t.prismaField({
    type: "TaskThreadInteraction",
    args: {
      taskId: t.arg.string({ required: true }),
      kind: t.arg.string({ required: true }),
      payload: t.arg({ type: "JSON", required: true }),
      sourceRunId: t.arg.string(),
      sourceMessageId: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.THREAD_INTERACTIONS);
      const tenancy = requireRole(ctx, "member");
      const it = await createThreadInteraction({
        taskId: args.taskId,
        kind: args.kind,
        payload: args.payload as never,
        sourceRunId: args.sourceRunId ?? null,
        sourceMessageId: args.sourceMessageId ?? null,
        createdByProfileId: tenancy.userId,
      });
      return ctx.prisma.taskThreadInteraction.findUniqueOrThrow({ ...query, where: { id: it.id } });
    },
  }),
);

builder.mutationField("resolveThreadInteraction", (t) =>
  t.prismaField({
    type: "TaskThreadInteraction",
    args: {
      id: t.arg.string({ required: true }),
      decision: t.arg.string({ required: true }), // resolved | dismissed
      result: t.arg({ type: "JSON" }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.THREAD_INTERACTIONS);
      const tenancy = requireRole(ctx, "member");
      const decision = args.decision === "dismissed" ? "dismissed" : "resolved";
      const it = await resolveThreadInteraction({
        id: args.id,
        decision,
        result: (args.result ?? null) as never,
        resolvedByProfileId: tenancy.userId,
      });
      return ctx.prisma.taskThreadInteraction.findUniqueOrThrow({ ...query, where: { id: it.id } });
    },
  }),
);
