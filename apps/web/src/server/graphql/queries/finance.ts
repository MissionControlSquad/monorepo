import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import {
  FLAG_KEYS,
  COST_WINDOWS,
  summarizeCostWindows,
  splitByBillingFamily,
} from "@agentcenter/utils";
import type { BudgetWindow, IncidentStatus } from "@agentcenter/database";
import { requireRole, scoped, requireTenancy } from "@/server/tenancy";
import { prisma } from "@/server/prisma";
import { windowBounds } from "@/server/services/budget-window";
import { costByTaskTree } from "@/server/services/cost-rollup";
import { costBreakdownCache, costTrendCache, financeSummaryCache } from "@/server/cache";

// Epic #4: finance/budget read layer — BUDGETS-gated, workspace-scoped, member+.

const GROUP_BY_COLUMN = {
  agent: "agentId",
  model: "model",
  provider: "provider",
  project: "projectId",
  biller: "billerId",
  issue: "issueId",
  billingType: "billingType",
} as const;
type CostGroupBy = keyof typeof GROUP_BY_COLUMN;

const CostBucket = builder.simpleObject("CostBucket", {
  fields: (t) => ({
    key: t.string(),
    label: t.string({ nullable: true }),
    amountCents: t.int(),
    eventCount: t.int(),
  }),
});

const CostTrendPoint = builder.simpleObject("CostTrendPoint", {
  fields: (t) => ({
    date: t.string(),
    amountCents: t.int(),
  }),
});

const FinanceSummary = builder.simpleObject("FinanceSummary", {
  fields: (t) => ({
    totalSpendCents: t.int(),
    windowSpendCents: t.int(),
    activePolicies: t.int(),
    openIncidents: t.int(),
  }),
});

const AgentWindowSpend = builder.simpleObject("AgentWindowSpend", {
  fields: (t) => ({
    policyId: t.string(),
    window: t.string(),
    spendCents: t.int(),
    limitCents: t.int(),
    breached: t.boolean(),
  }),
});

builder.queryField("budgetPolicies", (t) =>
  t.prismaField({
    type: ["BudgetPolicy"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      requireRole(ctx, "member");
      return ctx.prisma.budgetPolicy.findMany({
        ...query,
        where: scoped(ctx, {}),
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);

builder.queryField("budgetPolicy", (t) =>
  t.prismaField({
    type: "BudgetPolicy",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      requireRole(ctx, "member");
      return ctx.prisma.budgetPolicy.findFirst({ ...query, where: scoped(ctx, { id: args.id }) });
    },
  }),
);

builder.queryField("budgetIncidents", (t) =>
  t.prismaField({
    type: ["BudgetIncident"],
    args: { status: t.arg.string() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      requireRole(ctx, "member");
      return ctx.prisma.budgetIncident.findMany({
        ...query,
        where: scoped(ctx, args.status ? { status: args.status as IncidentStatus } : {}),
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);

builder.queryField("costBreakdown", (t) =>
  t.field({
    type: [CostBucket],
    args: {
      groupBy: t.arg.string({ required: true }),
      from: t.arg({ type: "DateTime" }),
      to: t.arg({ type: "DateTime" }),
      projectId: t.arg.string(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "member");
      const column = GROUP_BY_COLUMN[args.groupBy as CostGroupBy];
      if (!column) {
        throw new Error(`Invalid groupBy: ${args.groupBy}`);
      }
      const cacheKey = [
        tenancy.workspaceId,
        args.groupBy,
        args.from?.toISOString() ?? "",
        args.to?.toISOString() ?? "",
        args.projectId ?? "",
      ].join("|");
      const cached = costBreakdownCache.get(cacheKey);
      if (cached) return cached;

      const where = scoped(ctx, {
        ...(args.projectId ? { projectId: args.projectId } : {}),
        ...(args.from || args.to
          ? {
              occurredAt: {
                ...(args.from ? { gte: args.from } : {}),
                ...(args.to ? { lte: args.to } : {}),
              },
            }
          : {}),
      });

      const rows = await prisma.costEvent.groupBy({
        by: [column],
        where,
        _sum: { amountCents: true },
        _count: { _all: true },
      });

      const result = rows.map((r) => ({
        key: (r as Record<string, unknown>)[column]?.toString() ?? "unknown",
        label: (r as Record<string, unknown>)[column]?.toString() ?? null,
        amountCents: r._sum.amountCents ?? 0,
        eventCount: r._count._all,
      }));
      costBreakdownCache.set(cacheKey, result);
      return result;
    },
  }),
);

builder.queryField("costTrend", (t) =>
  t.field({
    type: [CostTrendPoint],
    args: { days: t.arg.int(), projectId: t.arg.string() },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "member");
      const days = Math.min(Math.max(args.days ?? 30, 1), 365);
      const cacheKey = [tenancy.workspaceId, days, args.projectId ?? ""].join("|");
      const cached = costTrendCache.get(cacheKey);
      if (cached) return cached;

      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const rows = args.projectId
        ? await prisma.$queryRaw<{ date: string; amount: number }[]>`
            SELECT to_char(date_trunc('day', "occurredAt"), 'YYYY-MM-DD') AS date,
                   SUM("amountCents")::int AS amount
            FROM "cost_events"
            WHERE "workspaceId" = ${tenancy.workspaceId}
              AND "occurredAt" >= ${since}
              AND "projectId" = ${args.projectId}
            GROUP BY 1 ORDER BY 1`
        : await prisma.$queryRaw<{ date: string; amount: number }[]>`
            SELECT to_char(date_trunc('day', "occurredAt"), 'YYYY-MM-DD') AS date,
                   SUM("amountCents")::int AS amount
            FROM "cost_events"
            WHERE "workspaceId" = ${tenancy.workspaceId}
              AND "occurredAt" >= ${since}
            GROUP BY 1 ORDER BY 1`;

      const result = rows.map((r) => ({ date: r.date, amountCents: Number(r.amount) }));
      costTrendCache.set(cacheKey, result);
      return result;
    },
  }),
);

builder.queryField("financeSummary", (t) =>
  t.field({
    type: FinanceSummary,
    args: { window: t.arg.string() },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "member");
      const window = (args.window as BudgetWindow) ?? "monthly";
      const cacheKey = [tenancy.workspaceId, window].join("|");
      const cached = financeSummaryCache.get(cacheKey);
      if (cached) return cached;

      const { windowStart } = windowBounds(window, new Date());
      const [total, windowSpend, activePolicies, openIncidents] = await Promise.all([
        prisma.costEvent.aggregate({
          where: { workspaceId: tenancy.workspaceId },
          _sum: { amountCents: true },
        }),
        prisma.costEvent.aggregate({
          where: { workspaceId: tenancy.workspaceId, occurredAt: { gte: windowStart } },
          _sum: { amountCents: true },
        }),
        prisma.budgetPolicy.count({ where: { workspaceId: tenancy.workspaceId, isActive: true } }),
        prisma.budgetIncident.count({
          where: { workspaceId: tenancy.workspaceId, status: "open" },
        }),
      ]);

      const result = {
        totalSpendCents: total._sum.amountCents ?? 0,
        windowSpendCents: windowSpend._sum.amountCents ?? 0,
        activePolicies,
        openIncidents,
      };
      financeSummaryCache.set(cacheKey, result);
      return result;
    },
  }),
);

builder.queryField("agentWindowSpend", (t) =>
  t.field({
    type: [AgentWindowSpend],
    args: { agentId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireTenancy(ctx);
      requireRole(ctx, "member");
      // Agent-scope policies for this agent, plus the workspace-wide policies that also cover it.
      const policies = await prisma.budgetPolicy.findMany({
        where: {
          workspaceId: tenancy.workspaceId,
          isActive: true,
          OR: [{ scope: "agent", agentId: args.agentId }, { scope: "workspace" }],
        },
        select: { id: true, window: true, limitCents: true },
      });
      const now = new Date();
      const out = await Promise.all(
        policies.map(async (p) => {
          const { windowStart } = windowBounds(p.window, now);
          const qw = await prisma.quotaWindow.findUnique({
            where: { policyId_windowStart: { policyId: p.id, windowStart } },
          });
          return {
            policyId: p.id,
            window: p.window,
            spendCents: qw?.spendCents ?? 0,
            limitCents: p.limitCents,
            breached: qw?.breached ?? false,
          };
        }),
      );
      return out;
    },
  }),
);

// Domain 12 GAP-6 A10: rolling per-provider spend over the standard windows (5h / 24h / 7d). Pure
// aggregation over CostEvent occurredAt. BUDGETS-gated, member+, workspace-scoped.
const CostWindowSpend = builder.simpleObject("CostWindowSpend", {
  fields: (t) => ({
    provider: t.string(),
    window: t.string(),
    amountCents: t.int(),
    eventCount: t.int(),
  }),
});

builder.queryField("costWindowSpend", (t) =>
  t.field({
    type: [CostWindowSpend],
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      requireRole(ctx, "member");
      const now = new Date();
      const longest = Math.max(...COST_WINDOWS.map((w) => w.ms));
      const rows = await prisma.costEvent.findMany({
        where: scoped(ctx, { occurredAt: { gte: new Date(now.getTime() - longest) } }),
        select: { provider: true, amountCents: true, occurredAt: true },
      });
      return summarizeCostWindows(rows, now);
    },
  }),
);

// Domain 12 GAP-6 A12: recursive issue-tree cost + runtime rollup over a task subtree.
const TaskTreeCost = builder.simpleObject("TaskTreeCost", {
  fields: (t) => ({
    rootTaskId: t.string(),
    taskCount: t.int(),
    costCents: t.int(),
    eventCount: t.int(),
    runCount: t.int(),
    runtimeSeconds: t.int(),
  }),
});

builder.queryField("costByTaskTree", (t) =>
  t.field({
    type: TaskTreeCost,
    args: {
      rootTaskId: t.arg.string({ required: true }),
      excludeRoot: t.arg.boolean(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "member");
      return costByTaskTree(tenancy.workspaceId, args.rootTaskId, args.excludeRoot ?? false);
    },
  }),
);

// Domain 12 GAP-6 A14: split spend into metered (API) vs subscription vs other families.
const BillingSplit = builder.simpleObject("BillingSplit", {
  fields: (t) => ({
    meteredCents: t.int(),
    subscriptionCents: t.int(),
    otherCents: t.int(),
    meteredCount: t.int(),
    subscriptionCount: t.int(),
    otherCount: t.int(),
  }),
});

builder.queryField("costBillingSplit", (t) =>
  t.field({
    type: BillingSplit,
    args: { from: t.arg({ type: "DateTime" }), to: t.arg({ type: "DateTime" }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      requireRole(ctx, "member");
      const rows = await prisma.costEvent.findMany({
        where: scoped(ctx, {
          ...(args.from || args.to
            ? {
                occurredAt: {
                  ...(args.from ? { gte: args.from } : {}),
                  ...(args.to ? { lte: args.to } : {}),
                },
              }
            : {}),
        }),
        select: { billingType: true, amountCents: true },
      });
      return splitByBillingFamily(rows);
    },
  }),
);
