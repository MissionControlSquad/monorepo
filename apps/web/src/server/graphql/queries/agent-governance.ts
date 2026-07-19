import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { getAgentGovernance } from "@/server/services/agent-governance";

// Epic A.4: workspace agent-governance read. GOVERNANCE-gated, workspace-scoped, member+.
const AgentGovernanceType = builder.simpleObject("AgentGovernance", {
  fields: (t) => ({
    requireAgentApproval: t.boolean(),
  }),
});

builder.queryField("agentGovernance", (t) =>
  t.field({
    type: AgentGovernanceType,
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.GOVERNANCE);
      const tenancy = requireRole(ctx, "member");
      return getAgentGovernance(tenancy.workspaceId);
    },
  }),
);
