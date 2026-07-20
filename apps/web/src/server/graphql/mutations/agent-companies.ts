import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import {
  createCompany,
  updateCompany,
  deleteCompany,
  setAgentCompany,
} from "@/server/services/agent-companies";

// Domain 14 #10: Agent-Company writes. AGENT_COMPANIES-gated, admin (org-shaping).
builder.mutationField("createAgentCompany", (t) =>
  t.prismaField({
    type: "AgentCompany",
    args: {
      name: t.arg.string({ required: true }),
      slug: t.arg.string(),
      description: t.arg.string(),
      goals: t.arg.stringList(),
      license: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.AGENT_COMPANIES);
      const tenancy = requireRole(ctx, "admin");
      const c = await createCompany({
        workspaceId: tenancy.workspaceId,
        name: args.name,
        slug: args.slug ?? null,
        description: args.description ?? null,
        goals: args.goals ?? null,
        license: args.license ?? null,
        createdByProfileId: tenancy.userId,
      });
      return ctx.prisma.agentCompany.findUniqueOrThrow({ ...query, where: { id: c.id } });
    },
  }),
);

builder.mutationField("updateAgentCompany", (t) =>
  t.prismaField({
    type: "AgentCompany",
    args: {
      id: t.arg.string({ required: true }),
      name: t.arg.string(),
      description: t.arg.string(),
      goals: t.arg.stringList(),
      license: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.AGENT_COMPANIES);
      const tenancy = requireRole(ctx, "admin");
      const c = await updateCompany(tenancy.workspaceId, args.id, {
        name: args.name ?? null,
        description: args.description ?? undefined,
        goals: args.goals ?? null,
        license: args.license ?? undefined,
      });
      return ctx.prisma.agentCompany.findUniqueOrThrow({ ...query, where: { id: c.id } });
    },
  }),
);

builder.mutationField("deleteAgentCompany", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.AGENT_COMPANIES);
      const tenancy = requireRole(ctx, "admin");
      return deleteCompany(tenancy.workspaceId, args.id);
    },
  }),
);

builder.mutationField("setAgentCompany", (t) =>
  t.prismaField({
    type: "Agent",
    args: { agentId: t.arg.string({ required: true }), companyId: t.arg.string() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.AGENT_COMPANIES);
      const tenancy = requireRole(ctx, "admin");
      await setAgentCompany(tenancy.workspaceId, args.agentId, args.companyId ?? null);
      return ctx.prisma.agent.findUniqueOrThrow({ ...query, where: { id: args.agentId } });
    },
  }),
);
