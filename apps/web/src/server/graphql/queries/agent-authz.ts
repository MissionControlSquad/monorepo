import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { listAgentGrants, listAuthzEvents } from "@/server/services/agent-authz";

// Epic #21: agent authorization reads — AGENT_AUTHZ-gated, member, workspace-scoped via the agent.
builder.queryField("agentCapabilityGrants", (t) =>
  t.prismaField({
    type: ["AgentCapabilityGrant"],
    args: { agentId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.AGENT_AUTHZ);
      const tenancy = requireRole(ctx, "member");
      const grants = await listAgentGrants(tenancy.workspaceId, args.agentId);
      const ids = grants.map((g) => g.id);
      return ctx.prisma.agentCapabilityGrant.findMany({
        ...query,
        where: { id: { in: ids } },
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);

builder.queryField("agentAuthzEvents", (t) =>
  t.prismaField({
    type: ["AgentAuthzEvent"],
    args: { agentId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.AGENT_AUTHZ);
      const tenancy = requireRole(ctx, "member");
      const events = await listAuthzEvents(tenancy.workspaceId, args.agentId);
      const ids = events.map((e) => e.id);
      return ctx.prisma.agentAuthzEvent.findMany({
        ...query,
        where: { id: { in: ids } },
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);
