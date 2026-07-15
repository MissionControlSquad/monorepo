import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import {
  createRoutine,
  updateRoutine,
  addRoutineTrigger,
  triggerRoutineNow,
  regenerateTriggerPublicId,
} from "@/server/services/routines";
import {
  createPipeline,
  addPipelineStage,
  createCase,
  claimCase,
  transitionCase,
  breakdownCase,
  rejectCase,
} from "@/server/services/pipelines";

// Epic #7 mutations. Routine/pipeline STRUCTURE is admin; working CASES (claim/transition/etc) is
// member. All PIPELINES_ROUTINES-gated + workspace-scoped via ctx.tenancy.

// ─── Routines ─────────────────────────────────────────────────────
builder.mutationField("createRoutine", (t) =>
  t.prismaField({
    type: "Routine",
    args: {
      name: t.arg.string({ required: true }),
      definition: t.arg({ type: "JSON", required: true }),
      description: t.arg.string(),
      timezone: t.arg.string(),
      projectId: t.arg.string(),
      assigneeAgentId: t.arg.string(),
      priority: t.arg.string(),
      goalId: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      const tenancy = requireRole(ctx, "admin");
      const routine = await createRoutine({
        workspaceId: tenancy.workspaceId,
        createdByProfileId: tenancy.userId,
        name: args.name,
        definition: args.definition,
        description: args.description ?? null,
        timezone: args.timezone ?? null,
        projectId: args.projectId ?? null,
        assigneeAgentId: args.assigneeAgentId ?? null,
        priority: (args.priority as "low" | "medium" | "high" | "urgent" | null) ?? null,
        goalId: args.goalId ?? null,
      });
      return ctx.prisma.routine.findUniqueOrThrow({ ...query, where: { id: routine.id } });
    },
  }),
);

builder.mutationField("updateRoutine", (t) =>
  t.prismaField({
    type: "Routine",
    args: {
      id: t.arg.string({ required: true }),
      name: t.arg.string(),
      description: t.arg.string(),
      definition: t.arg({ type: "JSON" }),
      isActive: t.arg.boolean(),
      assigneeAgentId: t.arg.string(),
      priority: t.arg.string(),
      goalId: t.arg.string(),
      clearAssignee: t.arg.boolean(),
      clearGoal: t.arg.boolean(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      const tenancy = requireRole(ctx, "admin");
      const routine = await updateRoutine(tenancy.workspaceId, args.id, {
        name: args.name ?? null,
        description: args.description ?? undefined,
        definition: args.definition ?? undefined,
        isActive: args.isActive ?? null,
        editedById: tenancy.userId,
        assigneeAgentId: args.assigneeAgentId ?? null,
        priority: (args.priority as "low" | "medium" | "high" | "urgent" | null) ?? null,
        goalId: args.goalId ?? null,
        clearAssignee: args.clearAssignee ?? false,
        clearGoal: args.clearGoal ?? false,
      });
      return ctx.prisma.routine.findUniqueOrThrow({ ...query, where: { id: routine.id } });
    },
  }),
);

builder.mutationField("addRoutineTrigger", (t) =>
  t.prismaField({
    type: "RoutineTrigger",
    args: {
      routineId: t.arg.string({ required: true }),
      type: t.arg.string({ required: true }),
      recurrenceConfig: t.arg({ type: "JSON" }),
      nextFireAt: t.arg({ type: "DateTime" }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      const tenancy = requireRole(ctx, "admin");
      const type = args.type === "cron" || args.type === "webhook" ? args.type : "manual";
      const trigger = await addRoutineTrigger(tenancy.workspaceId, args.routineId, {
        type,
        recurrenceConfig: args.recurrenceConfig ?? undefined,
        nextFireAt: args.nextFireAt ?? null,
      });
      return ctx.prisma.routineTrigger.findUniqueOrThrow({ ...query, where: { id: trigger.id } });
    },
  }),
);

builder.mutationField("regenerateTriggerPublicId", (t) =>
  t.prismaField({
    type: "RoutineTrigger",
    args: { triggerId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      const tenancy = requireRole(ctx, "admin");
      const trigger = await regenerateTriggerPublicId(tenancy.workspaceId, args.triggerId);
      return ctx.prisma.routineTrigger.findUniqueOrThrow({ ...query, where: { id: trigger.id } });
    },
  }),
);

builder.mutationField("triggerRoutineNow", (t) =>
  t.prismaField({
    type: "RoutineRun",
    args: { routineId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      const tenancy = requireRole(ctx, "member");
      const run = await triggerRoutineNow({
        workspaceId: tenancy.workspaceId,
        routineId: args.routineId,
        triggeredBy: "manual",
      });
      return ctx.prisma.routineRun.findUniqueOrThrow({ ...query, where: { id: run.id } });
    },
  }),
);

// ─── Pipelines ────────────────────────────────────────────────────
builder.mutationField("createPipeline", (t) =>
  t.prismaField({
    type: "Pipeline",
    args: {
      name: t.arg.string({ required: true }),
      description: t.arg.string(),
      projectId: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      const tenancy = requireRole(ctx, "admin");
      const p = await createPipeline({
        workspaceId: tenancy.workspaceId,
        name: args.name,
        description: args.description ?? null,
        projectId: args.projectId ?? null,
      });
      return ctx.prisma.pipeline.findUniqueOrThrow({ ...query, where: { id: p.id } });
    },
  }),
);

builder.mutationField("addPipelineStage", (t) =>
  t.prismaField({
    type: "PipelineStage",
    args: {
      pipelineId: t.arg.string({ required: true }),
      name: t.arg.string({ required: true }),
      order: t.arg.int({ required: true }),
      isReviewStage: t.arg.boolean(),
      slaMinutes: t.arg.int(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      const tenancy = requireRole(ctx, "admin");
      const stage = await addPipelineStage(tenancy.workspaceId, args.pipelineId, {
        name: args.name,
        order: args.order,
        isReviewStage: args.isReviewStage ?? false,
        slaMinutes: args.slaMinutes ?? null,
      });
      return ctx.prisma.pipelineStage.findUniqueOrThrow({ ...query, where: { id: stage.id } });
    },
  }),
);

builder.mutationField("createPipelineCase", (t) =>
  t.prismaField({
    type: "PipelineCase",
    args: {
      pipelineId: t.arg.string({ required: true }),
      title: t.arg.string({ required: true }),
      payload: t.arg({ type: "JSON" }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      const tenancy = requireRole(ctx, "member");
      const c = await createCase(tenancy.workspaceId, args.pipelineId, {
        title: args.title,
        payload: args.payload ?? undefined,
      });
      return ctx.prisma.pipelineCase.findUniqueOrThrow({ ...query, where: { id: c.id } });
    },
  }),
);

builder.mutationField("claimCase", (t) =>
  t.prismaField({
    type: "PipelineCase",
    args: { caseId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      const tenancy = requireRole(ctx, "member");
      const c = await claimCase(tenancy.workspaceId, args.caseId, tenancy.userId);
      return ctx.prisma.pipelineCase.findUniqueOrThrow({ ...query, where: { id: c.id } });
    },
  }),
);

builder.mutationField("transitionCase", (t) =>
  t.prismaField({
    type: "PipelineCase",
    args: {
      caseId: t.arg.string({ required: true }),
      toStageId: t.arg.string({ required: true }),
      note: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      const tenancy = requireRole(ctx, "member");
      const c = await transitionCase({
        workspaceId: tenancy.workspaceId,
        caseId: args.caseId,
        toStageId: args.toStageId,
        actorProfileId: tenancy.userId,
        note: args.note ?? null,
      });
      return ctx.prisma.pipelineCase.findUniqueOrThrow({ ...query, where: { id: c.id } });
    },
  }),
);

builder.mutationField("breakdownCase", (t) =>
  t.prismaField({
    type: "PipelineCase",
    args: {
      caseId: t.arg.string({ required: true }),
      title: t.arg.string({ required: true }),
      description: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      const tenancy = requireRole(ctx, "member");
      const res = await breakdownCase({
        workspaceId: tenancy.workspaceId,
        caseId: args.caseId,
        title: args.title,
        description: args.description,
        actorProfileId: tenancy.userId,
      });
      return ctx.prisma.pipelineCase.findUniqueOrThrow({ ...query, where: { id: res.case.id } });
    },
  }),
);

builder.mutationField("rejectCase", (t) =>
  t.prismaField({
    type: "PipelineCase",
    args: { caseId: t.arg.string({ required: true }), note: t.arg.string() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PIPELINES_ROUTINES);
      const tenancy = requireRole(ctx, "member");
      const c = await rejectCase({
        workspaceId: tenancy.workspaceId,
        caseId: args.caseId,
        actorProfileId: tenancy.userId,
        note: args.note ?? null,
      });
      return ctx.prisma.pipelineCase.findUniqueOrThrow({ ...query, where: { id: c.id } });
    },
  }),
);
