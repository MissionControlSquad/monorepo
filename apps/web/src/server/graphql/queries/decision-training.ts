import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { listDecisions } from "@/server/services/decision-training";
builder.queryField("decisions", (t) =>
  t.field({
    type: "JSON",
    args: { agentId: t.arg.string(), decisionType: t.arg.string() },
    resolve: async (_r, args, ctx) => {
      await requireFeature(FLAG_KEYS.DECISION_TRAINING);
      const tn = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return (await listDecisions(tn.workspaceId, {
        agentId: args.agentId ?? undefined,
        decisionType: args.decisionType ?? undefined,
      })) as unknown as Record<string, unknown>[];
    },
  }),
);
