import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";

// Domain 14 #10: Agent-Company reads. AGENT_COMPANIES-gated, member+, workspace-scoped.
builder.queryField("agentCompanies", (t) =>
  t.prismaField({
    type: ["AgentCompany"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.AGENT_COMPANIES);
      const tenancy = requireRole(ctx, "member");
      return ctx.prisma.agentCompany.findMany({
        ...query,
        where: { workspaceId: tenancy.workspaceId },
        orderBy: { name: "asc" },
      });
    },
  }),
);

builder.queryField("agentCompany", (t) =>
  t.prismaField({
    type: "AgentCompany",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.AGENT_COMPANIES);
      const tenancy = requireRole(ctx, "member");
      return ctx.prisma.agentCompany.findFirst({
        ...query,
        where: { id: args.id, workspaceId: tenancy.workspaceId },
      });
    },
  }),
);
