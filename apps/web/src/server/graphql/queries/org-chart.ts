import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole, scoped } from "@/server/tenancy";
import { getAgentOrgChainHealth } from "@/server/services/org-chart";

// Epic #19: org chart reads — ORG_CHART-gated, workspace-scoped, member.
builder.queryField("orgChart", (t) =>
  t.prismaField({
    type: ["Agent"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.ORG_CHART);
      requireRole(ctx, "member");
      return ctx.prisma.agent.findMany({
        ...query,
        where: scoped(ctx, {}),
        orderBy: { name: "asc" },
      });
    },
  }),
);

const OrgChainHealth = builder.simpleObject("OrgChainHealth", {
  fields: (t) => ({
    status: t.string(),
    reason: t.string(),
    chain: t.stringList(),
    invalidAncestorId: t.string({ nullable: true }),
  }),
});

builder.queryField("agentOrgChainHealth", (t) =>
  t.field({
    type: OrgChainHealth,
    args: { agentId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ORG_CHART);
      const tenancy = requireRole(ctx, "member");
      const agents = await ctx.prisma.agent.findMany({
        where: { workspaceId: tenancy.workspaceId },
        select: { id: true, name: true, reportsToAgentId: true },
      });
      return getAgentOrgChainHealth(args.agentId, agents);
    },
  }),
);
