import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { grantAgentCapability, revokeAgentCapability } from "@/server/services/agent-authz";

// Epic #21: agent capability grants. admin only (granting authority is privileged); AGENT_AUTHZ-gated.
builder.mutationField("grantAgentCapability", (t) =>
  t.prismaField({
    type: "AgentCapabilityGrant",
    args: {
      agentId: t.arg.string({ required: true }),
      capability: t.arg.string({ required: true }),
      projectScope: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.AGENT_AUTHZ);
      const tenancy = requireRole(ctx, "admin");
      const grant = await grantAgentCapability({
        workspaceId: tenancy.workspaceId,
        agentId: args.agentId,
        capability: args.capability,
        projectScope: args.projectScope ?? null,
        grantedByProfileId: tenancy.userId,
      });
      return ctx.prisma.agentCapabilityGrant.findUniqueOrThrow({
        ...query,
        where: { id: grant.id },
      });
    },
  }),
);

builder.mutationField("revokeAgentCapability", (t) =>
  t.field({
    type: "Boolean",
    args: { grantId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.AGENT_AUTHZ);
      const tenancy = requireRole(ctx, "admin");
      return revokeAgentCapability(tenancy.workspaceId, args.grantId);
    },
  }),
);
