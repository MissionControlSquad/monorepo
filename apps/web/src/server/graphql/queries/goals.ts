import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole, scoped } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { resolveDefaultGoal } from "@/server/services/goals";

// Epic #11: goals reads — GOALS-gated, workspace-scoped, member+.
builder.queryField("goals", (t) =>
  t.prismaField({
    type: ["Goal"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.GOALS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return ctx.prisma.goal.findMany({
        ...query,
        where: scoped(ctx, {}),
        orderBy: { createdAt: "asc" },
      });
    },
  }),
);

builder.queryField("goal", (t) =>
  t.prismaField({
    type: "Goal",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOALS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return ctx.prisma.goal.findFirst({ ...query, where: scoped(ctx, { id: args.id }) });
    },
  }),
);

builder.queryField("defaultGoal", (t) =>
  t.prismaField({
    type: "Goal",
    nullable: true,
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.GOALS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const g = await resolveDefaultGoal(tenancy.workspaceId);
      if (!g) return null;
      return ctx.prisma.goal.findUnique({ ...query, where: { id: g.id } });
    },
  }),
);
