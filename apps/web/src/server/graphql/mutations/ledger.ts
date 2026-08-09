import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { LedgerKind, LedgerSource } from "@agentcenter/database";
import { requireRole } from "@/server/tenancy";
import { invalidateLedger } from "@/server/cache";
import {
  createLedgerEvent,
  updateLedgerEvent,
  deleteLedgerEvent,
  createLedgerCategory,
  updateLedgerCategory,
} from "@/server/services/ledger";

// Epic #16: business ledger mutations — LEDGER-gated + admin only; members are read-only.
// workspaceId/createdBy come from ctx.tenancy (never client-supplied); no agent path.

builder.mutationField("createLedgerEvent", (t) =>
  t.prismaField({
    type: "LedgerEvent",
    args: {
      kind: t.arg.string({ required: true }),
      category: t.arg.string(),
      categoryId: t.arg.string(),
      biller: t.arg.string(),
      amountCents: t.arg.int({ required: true }),
      currency: t.arg.string(),
      description: t.arg.string(),
      projectId: t.arg.string(),
      source: t.arg.string(),
      occurredAt: t.arg({ type: "DateTime", required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LEDGER);
      const tenancy = requireRole(ctx, "admin");
      const event = await createLedgerEvent({
        workspaceId: tenancy.workspaceId,
        createdBy: tenancy.userId,
        kind: args.kind as LedgerKind,
        category: args.category ?? null,
        categoryId: args.categoryId ?? null,
        biller: args.biller ?? null,
        amountCents: args.amountCents,
        currency: args.currency ?? null,
        description: args.description ?? null,
        projectId: args.projectId ?? null,
        source: (args.source as LedgerSource) ?? null,
        occurredAt: args.occurredAt,
      });
      invalidateLedger();
      return ctx.prisma.ledgerEvent.findUniqueOrThrow({ ...query, where: { id: event.id } });
    },
  }),
);

builder.mutationField("updateLedgerEvent", (t) =>
  t.prismaField({
    type: "LedgerEvent",
    args: {
      id: t.arg.string({ required: true }),
      kind: t.arg.string(),
      category: t.arg.string(),
      categoryId: t.arg.string(),
      biller: t.arg.string(),
      amountCents: t.arg.int(),
      currency: t.arg.string(),
      description: t.arg.string(),
      projectId: t.arg.string(),
      occurredAt: t.arg({ type: "DateTime" }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LEDGER);
      const tenancy = requireRole(ctx, "admin");
      const event = await updateLedgerEvent(tenancy.workspaceId, args.id, {
        kind: (args.kind as LedgerKind) ?? null,
        category: args.category ?? null,
        categoryId: args.categoryId ?? undefined,
        biller: args.biller ?? undefined,
        amountCents: args.amountCents ?? null,
        currency: args.currency ?? null,
        description: args.description ?? undefined,
        projectId: args.projectId ?? undefined,
        occurredAt: args.occurredAt ?? null,
      });
      invalidateLedger();
      return ctx.prisma.ledgerEvent.findUniqueOrThrow({ ...query, where: { id: event.id } });
    },
  }),
);

builder.mutationField("deleteLedgerEvent", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LEDGER);
      const tenancy = requireRole(ctx, "admin");
      const ok = await deleteLedgerEvent(tenancy.workspaceId, args.id);
      invalidateLedger();
      return ok;
    },
  }),
);

builder.mutationField("createLedgerCategory", (t) =>
  t.prismaField({
    type: "LedgerCategory",
    args: { kind: t.arg.string({ required: true }), name: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LEDGER);
      const tenancy = requireRole(ctx, "admin");
      const cat = await createLedgerCategory({
        workspaceId: tenancy.workspaceId,
        createdBy: tenancy.userId,
        kind: args.kind as LedgerKind,
        name: args.name,
      });
      return ctx.prisma.ledgerCategory.findUniqueOrThrow({ ...query, where: { id: cat.id } });
    },
  }),
);

builder.mutationField("updateLedgerCategory", (t) =>
  t.prismaField({
    type: "LedgerCategory",
    args: {
      id: t.arg.string({ required: true }),
      name: t.arg.string(),
      archived: t.arg.boolean(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.LEDGER);
      const tenancy = requireRole(ctx, "admin");
      const cat = await updateLedgerCategory(tenancy.workspaceId, args.id, {
        name: args.name ?? null,
        archived: args.archived ?? null,
      });
      return ctx.prisma.ledgerCategory.findUniqueOrThrow({ ...query, where: { id: cat.id } });
    },
  }),
);
