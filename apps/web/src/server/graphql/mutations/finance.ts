import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { BudgetScope, BudgetWindow } from "@agentcenter/database";
import { requireRole } from "@/server/tenancy";
import { recordCostEvent } from "@/server/services/cost";
import {
  createBudgetPolicy,
  updateBudgetPolicy,
  deleteBudgetPolicy,
  resolveBudgetIncident,
  raiseBudgetAndResume,
} from "@/server/services/budgets";

// Epic #4: budget mutations. Policy/incident writes require admin; manual cost ingest member+.
// All BUDGETS-gated and workspace-scoped via ctx.tenancy.

builder.mutationField("createBudgetPolicy", (t) =>
  t.prismaField({
    type: "BudgetPolicy",
    args: {
      scope: t.arg.string({ required: true }),
      agentId: t.arg.string(),
      name: t.arg.string({ required: true }),
      limitCents: t.arg.int({ required: true }),
      window: t.arg.string({ required: true }),
      hardStop: t.arg.boolean(),
      warnPercent: t.arg.int(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "admin");
      const policy = await createBudgetPolicy({
        workspaceId: tenancy.workspaceId,
        scope: args.scope as BudgetScope,
        agentId: args.agentId ?? null,
        name: args.name,
        limitCents: args.limitCents,
        window: args.window as BudgetWindow,
        hardStop: args.hardStop ?? false,
        warnPercent: args.warnPercent ?? null,
      });
      return ctx.prisma.budgetPolicy.findUniqueOrThrow({ ...query, where: { id: policy.id } });
    },
  }),
);

builder.mutationField("updateBudgetPolicy", (t) =>
  t.prismaField({
    type: "BudgetPolicy",
    args: {
      id: t.arg.string({ required: true }),
      name: t.arg.string(),
      limitCents: t.arg.int(),
      window: t.arg.string(),
      hardStop: t.arg.boolean(),
      isActive: t.arg.boolean(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "admin");
      const policy = await updateBudgetPolicy({
        workspaceId: tenancy.workspaceId,
        id: args.id,
        name: args.name ?? null,
        limitCents: args.limitCents ?? null,
        window: (args.window as BudgetWindow) ?? null,
        hardStop: args.hardStop ?? null,
        isActive: args.isActive ?? null,
      });
      return ctx.prisma.budgetPolicy.findUniqueOrThrow({ ...query, where: { id: policy.id } });
    },
  }),
);

builder.mutationField("deleteBudgetPolicy", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "admin");
      return deleteBudgetPolicy(tenancy.workspaceId, args.id);
    },
  }),
);

builder.mutationField("ingestCostEvent", (t) =>
  t.prismaField({
    type: "CostEvent",
    args: {
      agentId: t.arg.string(),
      model: t.arg.string(),
      provider: t.arg.string(),
      taskId: t.arg.string(),
      projectId: t.arg.string(),
      billerId: t.arg.string(),
      issueId: t.arg.string(),
      tokensIn: t.arg.int(),
      tokensOut: t.arg.int(),
      amountCents: t.arg.int({ required: true }),
      billingType: t.arg.string(),
      source: t.arg.string(),
      idempotencyKey: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "member");
      const event = await recordCostEvent({
        workspaceId: tenancy.workspaceId,
        agentId: args.agentId ?? null,
        model: args.model ?? null,
        provider: args.provider ?? null,
        taskId: args.taskId ?? null,
        projectId: args.projectId ?? null,
        billerId: args.billerId ?? null,
        issueId: args.issueId ?? null,
        tokensIn: args.tokensIn ?? 0,
        tokensOut: args.tokensOut ?? 0,
        amountCents: args.amountCents,
        billingType: args.billingType ?? undefined,
        source: args.source ?? "manual",
        idempotencyKey: args.idempotencyKey ?? null,
      });
      return ctx.prisma.costEvent.findUniqueOrThrow({ ...query, where: { id: event.id } });
    },
  }),
);

builder.mutationField("resolveBudgetIncident", (t) =>
  t.prismaField({
    type: "BudgetIncident",
    args: { id: t.arg.string({ required: true }), detail: t.arg.string() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "admin");
      const incident = await resolveBudgetIncident({
        incidentId: args.id,
        workspaceId: tenancy.workspaceId,
        resolvedById: tenancy.userId,
        detail: args.detail ?? null,
      });
      return ctx.prisma.budgetIncident.findUniqueOrThrow({ ...query, where: { id: incident.id } });
    },
  }),
);

// Paperclip parity: raise a hard-stopped budget above observed spend and reactivate the agent.
builder.mutationField("raiseBudgetAndResume", (t) =>
  t.prismaField({
    type: "BudgetIncident",
    args: { id: t.arg.string({ required: true }), newLimitCents: t.arg.int({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "admin");
      const incident = await raiseBudgetAndResume({
        incidentId: args.id,
        workspaceId: tenancy.workspaceId,
        newLimitCents: args.newLimitCents,
        resolvedById: tenancy.userId,
      });
      return ctx.prisma.budgetIncident.findUniqueOrThrow({ ...query, where: { id: incident.id } });
    },
  }),
);
