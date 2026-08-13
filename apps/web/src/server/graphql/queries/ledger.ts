import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { LedgerKind } from "@agentcenter/database";
import { requireRole, scoped } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { prisma } from "@/server/prisma";
import {
  bucketStartOf,
  enumerateBuckets,
  type LedgerBucketKind,
} from "@/server/services/ledger-bucket";
import {
  ledgerSummaryCache,
  ledgerByKindCache,
  ledgerByBillerCache,
  ledgerByCategoryCache,
  ledgerByProjectCache,
  ledgerTimelineCache,
} from "@/server/cache";

// Epic #16: business P&L ledger reads — LEDGER-gated, workspace-scoped, member+ (read-only).

const UNSPECIFIED = "(unspecified)";

const LedgerSummary = builder.simpleObject("LedgerSummary", {
  fields: (t) => ({
    revenueCents: t.int(),
    expenseCents: t.int(),
    netCents: t.int(),
    currency: t.string(),
    eventCount: t.int(),
  }),
});

const LedgerKindTotal = builder.simpleObject("LedgerKindTotal", {
  fields: (t) => ({
    kind: t.string(),
    totalCents: t.int(),
    eventCount: t.int(),
  }),
});

const LedgerBillerTotal = builder.simpleObject("LedgerBillerTotal", {
  fields: (t) => ({
    biller: t.string(),
    revenueCents: t.int(),
    expenseCents: t.int(),
    netCents: t.int(),
    eventCount: t.int(),
  }),
});

const LedgerCategoryTotal = builder.simpleObject("LedgerCategoryTotal", {
  fields: (t) => ({
    category: t.string(),
    kind: t.string(),
    totalCents: t.int(),
    eventCount: t.int(),
  }),
});

const LedgerProjectTotal = builder.simpleObject("LedgerProjectTotal", {
  fields: (t) => ({
    projectId: t.string({ nullable: true }),
    projectName: t.string(),
    revenueCents: t.int(),
    expenseCents: t.int(),
    netCents: t.int(),
    eventCount: t.int(),
  }),
});

const LedgerTimelinePoint = builder.simpleObject("LedgerTimelinePoint", {
  fields: (t) => ({
    bucketStart: t.field({ type: "DateTime" }),
    revenueCents: t.int(),
    expenseCents: t.int(),
    netCents: t.int(),
  }),
});

// Page type carries a prisma-object list + cursor → objectRef (simpleObject can't take resolvers).
const LedgerEventPage = builder.objectRef<{ events: unknown[]; nextCursor: string | null }>(
  "LedgerEventPage",
);
LedgerEventPage.implement({
  fields: (t) => ({
    events: t.field({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Pothos custom object referencing Prisma list type
      type: ["LedgerEvent"] as any,
      resolve: (p) => p.events,
    }),
    nextCursor: t.string({ nullable: true, resolve: (p) => p.nextCursor }),
  }),
});

/** Build the occurredAt range filter from optional from/to args. */
function rangeWhere(from?: Date | null, to?: Date | null): Record<string, unknown> {
  if (!from && !to) return {};
  return {
    occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
  };
}

const rangeKey = (from?: Date | null, to?: Date | null) =>
  `${from?.toISOString() ?? ""}|${to?.toISOString() ?? ""}`;

builder.queryField("ledgerSummary", (t) =>
  t.field({
    type: LedgerSummary,
    args: { from: t.arg({ type: "DateTime" }), to: t.arg({ type: "DateTime" }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LEDGER);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const cacheKey = `${tenancy.workspaceId}|${rangeKey(args.from, args.to)}`;
      const cached = ledgerSummaryCache.get(cacheKey);
      if (cached) return cached;

      const where = scoped(ctx, rangeWhere(args.from, args.to));
      const grouped = await prisma.ledgerEvent.groupBy({
        by: ["kind"],
        where,
        _sum: { amountCents: true },
        _count: { _all: true },
      });
      let revenueCents = 0;
      let expenseCents = 0;
      let eventCount = 0;
      for (const g of grouped) {
        if (g.kind === "revenue") revenueCents = g._sum.amountCents ?? 0;
        else expenseCents = g._sum.amountCents ?? 0;
        eventCount += g._count._all;
      }
      // Single workspace currency in v1: report the most recent event's currency (dominant/first).
      const recent = await prisma.ledgerEvent.findFirst({
        where: scoped(ctx, {}),
        orderBy: { occurredAt: "desc" },
        select: { currency: true },
      });
      const result = {
        revenueCents,
        expenseCents,
        netCents: revenueCents - expenseCents,
        currency: recent?.currency ?? "USD",
        eventCount,
      };
      ledgerSummaryCache.set(cacheKey, result);
      return result;
    },
  }),
);

builder.queryField("ledgerByKind", (t) =>
  t.field({
    type: [LedgerKindTotal],
    args: { from: t.arg({ type: "DateTime" }), to: t.arg({ type: "DateTime" }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LEDGER);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const cacheKey = `${tenancy.workspaceId}|${rangeKey(args.from, args.to)}`;
      const cached = ledgerByKindCache.get(cacheKey);
      if (cached) return cached;

      const grouped = await prisma.ledgerEvent.groupBy({
        by: ["kind"],
        where: scoped(ctx, rangeWhere(args.from, args.to)),
        _sum: { amountCents: true },
        _count: { _all: true },
      });
      const result = grouped.map((g) => ({
        kind: g.kind,
        totalCents: g._sum.amountCents ?? 0,
        eventCount: g._count._all,
      }));
      ledgerByKindCache.set(cacheKey, result);
      return result;
    },
  }),
);

builder.queryField("ledgerByBiller", (t) =>
  t.field({
    type: [LedgerBillerTotal],
    args: { from: t.arg({ type: "DateTime" }), to: t.arg({ type: "DateTime" }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LEDGER);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const cacheKey = `${tenancy.workspaceId}|${rangeKey(args.from, args.to)}`;
      const cached = ledgerByBillerCache.get(cacheKey);
      if (cached) return cached;

      const grouped = await prisma.ledgerEvent.groupBy({
        by: ["biller", "kind"],
        where: scoped(ctx, rangeWhere(args.from, args.to)),
        _sum: { amountCents: true },
        _count: { _all: true },
      });
      const byBiller = new Map<
        string,
        { biller: string; revenueCents: number; expenseCents: number; eventCount: number }
      >();
      for (const g of grouped) {
        const key = g.biller ?? UNSPECIFIED;
        const row = byBiller.get(key) ?? {
          biller: key,
          revenueCents: 0,
          expenseCents: 0,
          eventCount: 0,
        };
        const sum = g._sum.amountCents ?? 0;
        if (g.kind === "revenue") row.revenueCents += sum;
        else row.expenseCents += sum;
        row.eventCount += g._count._all;
        byBiller.set(key, row);
      }
      const result = [...byBiller.values()]
        .map((r) => ({ ...r, netCents: r.revenueCents - r.expenseCents }))
        .sort((a, b) => b.netCents - a.netCents);
      ledgerByBillerCache.set(cacheKey, result);
      return result;
    },
  }),
);

builder.queryField("ledgerByCategory", (t) =>
  t.field({
    type: [LedgerCategoryTotal],
    args: { from: t.arg({ type: "DateTime" }), to: t.arg({ type: "DateTime" }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LEDGER);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const cacheKey = `${tenancy.workspaceId}|${rangeKey(args.from, args.to)}`;
      const cached = ledgerByCategoryCache.get(cacheKey);
      if (cached) return cached;

      const grouped = await prisma.ledgerEvent.groupBy({
        by: ["category", "kind"],
        where: scoped(ctx, rangeWhere(args.from, args.to)),
        _sum: { amountCents: true },
        _count: { _all: true },
      });
      const result = grouped.map((g) => ({
        category: g.category,
        kind: g.kind,
        totalCents: g._sum.amountCents ?? 0,
        eventCount: g._count._all,
      }));
      ledgerByCategoryCache.set(cacheKey, result);
      return result;
    },
  }),
);

builder.queryField("ledgerByProject", (t) =>
  t.field({
    type: [LedgerProjectTotal],
    args: { from: t.arg({ type: "DateTime" }), to: t.arg({ type: "DateTime" }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LEDGER);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const cacheKey = `${tenancy.workspaceId}|${rangeKey(args.from, args.to)}`;
      const cached = ledgerByProjectCache.get(cacheKey);
      if (cached) return cached;

      const grouped = await prisma.ledgerEvent.groupBy({
        by: ["projectId", "kind"],
        where: scoped(ctx, rangeWhere(args.from, args.to)),
        _sum: { amountCents: true },
        _count: { _all: true },
      });
      const byProject = new Map<
        string,
        {
          projectId: string | null;
          revenueCents: number;
          expenseCents: number;
          eventCount: number;
        }
      >();
      for (const g of grouped) {
        const key = g.projectId ?? "";
        const row = byProject.get(key) ?? {
          projectId: g.projectId ?? null,
          revenueCents: 0,
          expenseCents: 0,
          eventCount: 0,
        };
        const sum = g._sum.amountCents ?? 0;
        if (g.kind === "revenue") row.revenueCents += sum;
        else row.expenseCents += sum;
        row.eventCount += g._count._all;
        byProject.set(key, row);
      }
      // Resolve project names (workspace-scoped) for the grouped ids; unlinked → "(no project)".
      const ids = [...byProject.keys()].filter(Boolean);
      const projects = ids.length
        ? await prisma.project.findMany({
            where: scoped(ctx, { id: { in: ids } }),
            select: { id: true, name: true },
          })
        : [];
      const nameById = new Map(projects.map((p) => [p.id, p.name]));
      const result = [...byProject.values()]
        .map((r) => ({
          ...r,
          projectName: r.projectId ? (nameById.get(r.projectId) ?? "(unknown)") : "(no project)",
          netCents: r.revenueCents - r.expenseCents,
        }))
        .sort((a, b) => b.netCents - a.netCents);
      ledgerByProjectCache.set(cacheKey, result);
      return result;
    },
  }),
);

builder.queryField("ledgerTimeline", (t) =>
  t.field({
    type: [LedgerTimelinePoint],
    args: {
      from: t.arg({ type: "DateTime" }),
      to: t.arg({ type: "DateTime" }),
      bucket: t.arg.string(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LEDGER);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const bucket = (
        ["day", "week", "month"].includes(args.bucket ?? "day") ? (args.bucket ?? "day") : "day"
      ) as LedgerBucketKind;
      const now = new Date();
      const from = args.from ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const to = args.to ?? now;
      const cacheKey = `${tenancy.workspaceId}|${bucket}|${rangeKey(from, to)}`;
      const cached = ledgerTimelineCache.get(cacheKey);
      if (cached) return cached;

      const rows = await prisma.ledgerEvent.findMany({
        where: scoped(ctx, rangeWhere(from, to)),
        select: { occurredAt: true, kind: true, amountCents: true },
      });
      // Bucket in JS (reuses the tested pure bucket math) then zero-fill.
      const acc = new Map<string, { revenueCents: number; expenseCents: number }>();
      for (const r of rows) {
        const key = bucketStartOf(r.occurredAt, bucket).toISOString();
        const cell = acc.get(key) ?? { revenueCents: 0, expenseCents: 0 };
        if (r.kind === "revenue") cell.revenueCents += r.amountCents;
        else cell.expenseCents += r.amountCents;
        acc.set(key, cell);
      }
      const result = enumerateBuckets(from, to, bucket).map((b) => {
        const cell = acc.get(b.bucketStart.toISOString()) ?? { revenueCents: 0, expenseCents: 0 };
        return {
          bucketStart: b.bucketStart,
          revenueCents: cell.revenueCents,
          expenseCents: cell.expenseCents,
          netCents: cell.revenueCents - cell.expenseCents,
        };
      });
      ledgerTimelineCache.set(cacheKey, result);
      return result;
    },
  }),
);

builder.queryField("ledgerEvents", (t) =>
  t.field({
    type: LedgerEventPage,
    args: {
      from: t.arg({ type: "DateTime" }),
      to: t.arg({ type: "DateTime" }),
      kind: t.arg.string(),
      category: t.arg.string(),
      biller: t.arg.string(),
      projectId: t.arg.string(),
      limit: t.arg.int(),
      cursor: t.arg.string(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LEDGER);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const take = Math.min(Math.max(args.limit ?? 50, 1), 200);
      const where = scoped(ctx, {
        ...rangeWhere(args.from, args.to),
        ...(args.kind ? { kind: args.kind as LedgerKind } : {}),
        ...(args.category ? { category: args.category } : {}),
        ...(args.biller ? { biller: args.biller } : {}),
        ...(args.projectId ? { projectId: args.projectId } : {}),
      });
      const events = await prisma.ledgerEvent.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
      });
      const hasMore = events.length > take;
      const page = hasMore ? events.slice(0, take) : events;
      return { events: page, nextCursor: hasMore ? page[page.length - 1].id : null };
    },
  }),
);

builder.queryField("ledgerCategories", (t) =>
  t.prismaField({
    type: ["LedgerCategory"],
    args: { kind: t.arg.string(), includeArchived: t.arg.boolean() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LEDGER);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return ctx.prisma.ledgerCategory.findMany({
        ...query,
        where: scoped(ctx, {
          ...(args.kind ? { kind: args.kind as LedgerKind } : {}),
          ...(args.includeArchived ? {} : { archived: false }),
        }),
        orderBy: [{ kind: "asc" }, { name: "asc" }],
      });
    },
  }),
);
