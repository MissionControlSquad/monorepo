import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole, scoped, requireTenancy } from "@/server/tenancy";
import { reviewCases, computePipelineHealth, staleClaimedCases } from "@/server/services/pipelines";

// Epic #7: routines + pipelines reads — PIPELINES_ROUTINES-gated, workspace-scoped, member+.

const StaleCase = builder.simpleObject("StaleCase", {
  fields: (t) => ({
    caseId: t.string(),
    title: t.string(),
    stageId: t.string(),
    minutesInStage: t.int(),
    slaMinutes: t.int(),
  }),
});

const StaleClaim = builder.simpleObject("StaleClaim", {
  fields: (t) => ({
    caseId: t.string(),
    title: t.string(),
    claimedByProfileId: t.string({ nullable: true }),
    minutesClaimed: t.int(),
    leaseMinutes: t.int(),
  }),
});

builder.queryField("routines", (t) =>
  t.prismaField({
    type: ["Routine"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      requireRole(ctx, "member");
      return ctx.prisma.routine.findMany({
        ...query,
        where: scoped(ctx, {}),
        orderBy: { updatedAt: "desc" },
      });
    },
  }),
);

builder.queryField("routine", (t) =>
  t.prismaField({
    type: "Routine",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      requireRole(ctx, "member");
      return ctx.prisma.routine.findFirst({ ...query, where: scoped(ctx, { id: args.id }) });
    },
  }),
);

builder.queryField("routineRuns", (t) =>
  t.prismaField({
    type: ["RoutineRun"],
    args: { routineId: t.arg.string({ required: true }), limit: t.arg.int() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      requireRole(ctx, "member");
      const routine = await ctx.prisma.routine.findFirst({
        where: scoped(ctx, { id: args.routineId }),
        select: { id: true },
      });
      if (!routine) return [];
      return ctx.prisma.routineRun.findMany({
        ...query,
        where: { routineId: routine.id },
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(args.limit ?? 50, 1), 200),
      });
    },
  }),
);

builder.queryField("pipelines", (t) =>
  t.prismaField({
    type: ["Pipeline"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      requireRole(ctx, "member");
      return ctx.prisma.pipeline.findMany({
        ...query,
        where: scoped(ctx, {}),
        orderBy: { updatedAt: "desc" },
      });
    },
  }),
);

builder.queryField("pipeline", (t) =>
  t.prismaField({
    type: "Pipeline",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      requireRole(ctx, "member");
      return ctx.prisma.pipeline.findFirst({ ...query, where: scoped(ctx, { id: args.id }) });
    },
  }),
);

builder.queryField("casesInPipeline", (t) =>
  t.prismaField({
    type: ["PipelineCase"],
    args: { pipelineId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      requireRole(ctx, "member");
      // Scope through the owning pipeline so another workspace's cases never leak.
      const pipeline = await ctx.prisma.pipeline.findFirst({
        where: scoped(ctx, { id: args.pipelineId }),
        select: { id: true },
      });
      if (!pipeline) return [];
      return ctx.prisma.pipelineCase.findMany({
        ...query,
        where: { pipelineId: pipeline.id },
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);

builder.queryField("reviewCases", (t) =>
  t.prismaField({
    type: ["PipelineCase"],
    args: { pipelineId: t.arg.string() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      const tenancy = requireRole(ctx, "member");
      // Service builds the review-stage filter; re-apply Pothos selection over the same ids.
      const cases = await reviewCases(tenancy.workspaceId, args.pipelineId ?? null);
      return ctx.prisma.pipelineCase.findMany({
        ...query,
        where: { id: { in: cases.map((c) => c.id) } },
        orderBy: { enteredStageAt: "asc" },
      });
    },
  }),
);

builder.queryField("pipelineHealth", (t) =>
  t.field({
    type: [StaleCase],
    args: { pipelineId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      const tenancy = requireTenancy(ctx);
      requireRole(ctx, "member");
      return computePipelineHealth(tenancy.workspaceId, args.pipelineId);
    },
  }),
);

// Cases whose claim lease has expired (claimed > leaseMinutes ago, still not advanced).
builder.queryField("staleClaims", (t) =>
  t.field({
    type: [StaleClaim],
    args: { leaseMinutes: t.arg.int(), pipelineId: t.arg.string() },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      const tenancy = requireTenancy(ctx);
      requireRole(ctx, "member");
      const lease = Math.min(Math.max(args.leaseMinutes ?? 60, 1), 100000);
      return staleClaimedCases(tenancy.workspaceId, lease, args.pipelineId ?? null);
    },
  }),
);
