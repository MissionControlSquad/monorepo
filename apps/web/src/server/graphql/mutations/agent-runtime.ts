import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { GraphQLError } from "graphql";
import { FLAG_KEYS, isAdapterKey } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";

// Tier D: set an agent's runtime adapter/model/template so the control plane dictates how a runner
// launches it (overrides the runner's own default). RUNNERS-gated, admin. Pass adapter=null to clear.
builder.mutationField("setAgentRuntime", (t) =>
  t.prismaField({
    type: "Agent",
    args: {
      agentId: t.arg.string({ required: true }),
      adapter: t.arg.string(),
      model: t.arg.string(),
      template: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, "admin");
      if (args.adapter && !isAdapterKey(args.adapter))
        throw new GraphQLError(`Unknown runtime adapter: ${args.adapter}`, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      const agent = await ctx.prisma.agent.findFirst({
        where: { id: args.agentId, workspaceId: tenancy.workspaceId },
        select: { id: true },
      });
      if (!agent) throw new GraphQLError("Agent not found", { extensions: { code: "NOT_FOUND" } });
      return ctx.prisma.agent.update({
        ...query,
        where: { id: agent.id },
        data: {
          runtimeAdapter: args.adapter ?? null,
          runtimeModel: args.model ?? null,
          runtimeTemplate: args.template ?? null,
        },
      });
    },
  }),
);
