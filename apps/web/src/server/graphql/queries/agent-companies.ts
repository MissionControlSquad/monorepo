import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { exportCompanyPackage } from "@/server/services/agent-companies";

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

// Domain 14 #12: export a company as a portable markdown package (path→content file map).
const CompanyPackageFile = builder.simpleObject("CompanyPackageFile", {
  fields: (t) => ({ path: t.string(), content: t.string() }),
});

builder.queryField("exportCompanyPackage", (t) =>
  t.field({
    type: [CompanyPackageFile],
    args: { companyId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.AGENT_COMPANIES);
      const tenancy = requireRole(ctx, "member");
      return exportCompanyPackage(tenancy.workspaceId, args.companyId);
    },
  }),
);
