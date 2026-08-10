import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { BudgetScope, BudgetWindow } from "@agentcenter/database";
import { requireRole } from "@/server/tenancy";
import { recordCostEvent, repriceCostEvent } from "@/server/services/cost";
import { recordFinanceEvent } from "@/server/services/finance-events";
import {
  createBudgetPolicy,
  updateBudgetPolicy,
  deleteBudgetPolicy,
  resolveBudgetIncident,
  raiseBudgetAndResume,
  setAgentSalary,
} from "@/server/services/budgets";

// Epic #4: budget mutations. Policy/incident writes require admin; manual cost ingest member+.
// All BUDGETS-gated and workspace-scoped via ctx.tenancy.

builder.mutationField("createBudgetPolicy", (t) =>
  t.prismaField({
    type: "BudgetPolicy",
    args: {
      scope: t.arg.string({ required: true }),
      agentId: t.arg.string(),
      projectId: t.arg.string(),
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
        projectId: args.projectId ?? null,
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
      costStatus: t.arg.string(),
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
        costStatus: args.costStatus ?? undefined,
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

// Domain 12 GAP-1: ingest a non-inference finance event (credit purchase, platform/BYOK fee, storage/
// training charge, manual adjustment, …). Admin only — these are human-entered account charges, never
// an agent API key. BUDGETS-gated, workspace-scoped.
builder.mutationField("ingestFinanceEvent", (t) =>
  t.prismaField({
    type: "FinanceEvent",
    args: {
      eventKind: t.arg.string({ required: true }),
      amountCents: t.arg.int({ required: true }),
      direction: t.arg.string(),
      unit: t.arg.string(),
      currency: t.arg.string(),
      biller: t.arg.string(),
      provider: t.arg.string(),
      description: t.arg.string(),
      quantity: t.arg.float(),
      estimated: t.arg.boolean(),
      externalInvoiceId: t.arg.string(),
      costEventId: t.arg.string(),
      idempotencyKey: t.arg.string(),
      occurredAt: t.arg({ type: "DateTime" }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "admin");
      const ev = await recordFinanceEvent({
        workspaceId: tenancy.workspaceId,
        eventKind: args.eventKind,
        amountCents: args.amountCents,
        direction: args.direction ?? undefined,
        unit: args.unit ?? undefined,
        currency: args.currency ?? undefined,
        biller: args.biller ?? null,
        provider: args.provider ?? null,
        description: args.description ?? null,
        quantity: args.quantity ?? null,
        estimated: args.estimated ?? false,
        externalInvoiceId: args.externalInvoiceId ?? null,
        costEventId: args.costEventId ?? null,
        idempotencyKey: args.idempotencyKey ?? null,
        occurredAt: args.occurredAt ?? undefined,
      });
      return ctx.prisma.financeEvent.findUniqueOrThrow({ ...query, where: { id: ev.id } });
    },
  }),
);

// Domain 12 GAP-6 A13: reprice an unpriced/estimated cost event once the provider amount is known.
builder.mutationField("repriceCostEvent", (t) =>
  t.prismaField({
    type: "CostEvent",
    args: {
      costEventId: t.arg.string({ required: true }),
      amountCents: t.arg.int({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "member");
      const ev = await repriceCostEvent(tenancy.workspaceId, args.costEventId, args.amountCents);
      return ctx.prisma.costEvent.findUniqueOrThrow({ ...query, where: { id: ev.id } });
    },
  }),
);

// Domain 14 #18: set an agent's token "salary" (monthly per-agent allowance). 0 removes it. admin.
builder.mutationField("setAgentSalary", (t) =>
  t.prismaField({
    type: "BudgetPolicy",
    nullable: true,
    args: {
      agentId: t.arg.string({ required: true }),
      monthlyCents: t.arg.int({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "admin");
      const pol = await setAgentSalary({
        workspaceId: tenancy.workspaceId,
        agentId: args.agentId,
        monthlyCents: args.monthlyCents,
      });
      if (!pol) return null;
      return ctx.prisma.budgetPolicy.findUniqueOrThrow({ ...query, where: { id: pol.id } });
    },
  }),
);
