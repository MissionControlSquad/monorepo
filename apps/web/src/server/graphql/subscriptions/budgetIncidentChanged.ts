import { builder } from "../builder";
import { pubsub, budgetIncidentTopic } from "../../pubsub";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";

// Epic #4: live budget incidents (open/resolve) for the caller's workspace only.
builder.subscriptionField("budgetIncidentChanged", (t) =>
  t.prismaField({
    type: "BudgetIncident",
    subscribe: (_root, _args, ctx) => {
      const tenancy = requireRole(ctx, "member");
      return pubsub.subscribe(budgetIncidentTopic(tenancy.workspaceId));
    },
    resolve: async (query, payload, _args, ctx) => {
      await requireFeature(FLAG_KEYS.BUDGETS);
      const tenancy = requireRole(ctx, "member");
      // Re-scope by workspace on read — never surface another workspace's incident.
      return ctx.prisma.budgetIncident.findFirstOrThrow({
        ...query,
        where: { id: payload.incidentId, workspaceId: tenancy.workspaceId },
      });
    },
  }),
);
