import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { setAgentGovernance } from "@/server/services/agent-governance";

// Epic A.4: workspace agent-governance write. GOVERNANCE-gated, admin only.
const AgentGovernanceOut = builder.simpleObject("AgentGovernanceResult", {
  fields: (t) => ({
    requireAgentApproval: t.boolean(),
  }),
});

builder.mutationField("setAgentGovernance", (t) =>
  t.field({
    type: AgentGovernanceOut,
    args: { requireAgentApproval: t.arg.boolean() },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      const tenancy = requireRole(ctx, "admin");
      return setAgentGovernance(tenancy.workspaceId, {
        requireAgentApproval: args.requireAgentApproval ?? undefined,
      });
    },
  }),
);
