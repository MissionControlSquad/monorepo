import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { CaseState } from "@agentcenter/database";
import { requireRole, scoped } from "@/server/tenancy";

// Epic #17: cases reads — CASES-gated, workspace-scoped, member+.
builder.queryField("cases", (t) =>
  t.prismaField({
    type: ["Case"],
    args: { status: t.arg.string(), caseType: t.arg.string() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.CASES);
      requireRole(ctx, "member");
      return ctx.prisma.case.findMany({
        ...query,
        where: scoped(ctx, {
          ...(args.status ? { status: args.status as CaseState } : {}),
          ...(args.caseType ? { caseType: args.caseType } : {}),
        }),
        orderBy: { caseNumber: "desc" },
      });
    },
  }),
);

builder.queryField("case", (t) =>
  t.prismaField({
    type: "Case",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.CASES);
      requireRole(ctx, "member");
      return ctx.prisma.case.findFirst({ ...query, where: scoped(ctx, { id: args.id }) });
    },
  }),
);

builder.queryField("caseEvents", (t) =>
  t.prismaField({
    type: ["CaseEvent"],
    args: { caseId: t.arg.string({ required: true }), limit: t.arg.int() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.CASES);
      requireRole(ctx, "member");
      const c = await ctx.prisma.case.findFirst({
        where: scoped(ctx, { id: args.caseId }),
        select: { id: true },
      });
      if (!c) return [];
      return ctx.prisma.caseEvent.findMany({
        ...query,
        where: { caseId: c.id },
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(args.limit ?? 100, 1), 500),
      });
    },
  }),
);

builder.queryField("casesForTask", (t) =>
  t.prismaField({
    type: ["Case"],
    args: { taskId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.CASES);
      requireRole(ctx, "member");
      return ctx.prisma.case.findMany({
        ...query,
        where: scoped(ctx, { taskLinks: { some: { taskId: args.taskId } } }),
        orderBy: { caseNumber: "desc" },
      });
    },
  }),
);

builder.queryField("labels", (t) =>
  t.prismaField({
    type: ["Label"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.CASES);
      requireRole(ctx, "member");
      return ctx.prisma.label.findMany({
        ...query,
        where: scoped(ctx, {}),
        orderBy: { name: "asc" },
      });
    },
  }),
);
