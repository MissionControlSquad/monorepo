import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";

// Approval-policy list. GOVERNANCE-gated, member+ may view (admin manages). Workspace-scoped.
builder.queryField("approvalPolicies", (t) =>
  t.prismaField({
    type: ["ApprovalPolicy"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return ctx.prisma.approvalPolicy.findMany({
        ...query,
        where: { workspaceId: tenancy.workspaceId },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      });
    },
  }),
);
