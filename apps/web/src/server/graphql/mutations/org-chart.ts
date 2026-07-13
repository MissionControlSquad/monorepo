import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { setAgentReportsTo } from "@/server/services/org-chart";

// Epic #19: set an agent's manager (org edge). member; ORG_CHART-gated; cycle + cross-workspace safe.
builder.mutationField("setAgentReportsTo", (t) =>
  t.prismaField({
    type: "Agent",
    args: {
      agentId: t.arg.string({ required: true }),
      reportsToAgentId: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ORG_CHART);
      const tenancy = requireRole(ctx, "member");
      const agent = await setAgentReportsTo(
        tenancy.workspaceId,
        args.agentId,
        args.reportsToAgentId ?? null,
      );
      return ctx.prisma.agent.findUniqueOrThrow({ ...query, where: { id: agent.id } });
    },
  }),
);
