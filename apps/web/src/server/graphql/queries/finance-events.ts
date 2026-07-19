import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import {
  financeSummary,
  financeByBiller,
  financeByKind,
  listFinanceEvents,
} from "@/server/services/finance-events";

// Domain 12 GAP-1: non-inference finance ledger read surfaces. BUDGETS-gated, member+ for reads.

const FinanceEventSummary = builder.simpleObject("FinanceEventSummary", {
  fields: (t) => ({
    debitCents: t.int(),
    creditCents: t.int(),
    netCents: t.int(),
    estimatedCents: t.int(),
    count: t.int(),
  }),
});

const FinanceEventGroup = builder.simpleObject("FinanceEventGroup", {
  fields: (t) => ({
    key: t.string(),
    debitCents: t.int(),
    creditCents: t.int(),
    netCents: t.int(),
    count: t.int(),
  }),
});

function range(since?: Date | null, until?: Date | null) {
  return { since: since ?? null, until: until ?? null };
}

builder.queryField("financeEventSummary", (t) =>
  t.field({
    type: FinanceEventSummary,
    args: { since: t.arg({ type: "DateTime" }), until: t.arg({ type: "DateTime" }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "member");
      return financeSummary({ workspaceId: tenancy.workspaceId, ...range(args.since, args.until) });
    },
  }),
);

builder.queryField("financeEventsByBiller", (t) =>
  t.field({
    type: [FinanceEventGroup],
    args: { since: t.arg({ type: "DateTime" }), until: t.arg({ type: "DateTime" }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "member");
      return financeByBiller({
        workspaceId: tenancy.workspaceId,
        ...range(args.since, args.until),
      });
    },
  }),
);

builder.queryField("financeEventsByKind", (t) =>
  t.field({
    type: [FinanceEventGroup],
    args: { since: t.arg({ type: "DateTime" }), until: t.arg({ type: "DateTime" }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "member");
      return financeByKind({ workspaceId: tenancy.workspaceId, ...range(args.since, args.until) });
    },
  }),
);

builder.queryField("financeEvents", (t) =>
  t.prismaField({
    type: ["FinanceEvent"],
    args: { limit: t.arg.int() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "member");
      // The service caps + orders; prismaField selection is merged for field resolution.
      const rows = await listFinanceEvents({ workspaceId: tenancy.workspaceId }, args.limit ?? 50);
      return ctx.prisma.financeEvent.findMany({
        ...query,
        where: { id: { in: rows.map((r) => r.id) } },
        orderBy: { occurredAt: "desc" },
      });
    },
  }),
);
