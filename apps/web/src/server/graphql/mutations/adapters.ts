import { GraphQLError } from "graphql";
import { builder } from "../builder";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole, scoped } from "@/server/tenancy";
import { isFeatureEnabled } from "@/server/feature-flags";
import { getAdapter, validateAdapterConfig } from "@/server/adapters/registry";

// Epic #2: assign an adapter (+ validated config) to an agent. Admin-only, workspace-scoped.
// A non-builtIn adapter requires the multi_provider_adapters feature; openclaw-gateway always works.
builder.mutationField("setAgentAdapter", (t) =>
  t.prismaField({
    type: "Agent",
    args: {
      agentId: t.arg.string({ required: true }),
      adapterType: t.arg.string({ required: true }),
      adapterConfig: t.arg({ type: "JSON" }),
    },
    resolve: async (query, _root, args, ctx) => {
      requireRole(ctx, "admin");

      // Agent must belong to the caller's workspace.
      const agent = await ctx.prisma.agent.findFirst({ where: scoped(ctx, { id: args.agentId }) });
      if (!agent) throw new GraphQLError("Agent not found", { extensions: { code: "NOT_FOUND" } });

      const adapter = await getAdapter(args.adapterType);
      if (!adapter || !adapter.enabled)
        throw new GraphQLError(`Unknown or disabled adapter '${args.adapterType}'`, {
          extensions: { code: "BAD_USER_INPUT" },
        });

      // Non-builtIn adapters are gated by the feature.
      if (!adapter.builtIn) {
        const featureEnabled = await isFeatureEnabled(FLAG_KEYS.MULTI_PROVIDER_ADAPTERS);
        if (!featureEnabled)
          throw new GraphQLError("Multi-provider adapters are not enabled on your plan", {
            extensions: { code: "FEATURE_DISABLED", feature: FLAG_KEYS.MULTI_PROVIDER_ADAPTERS },
          });
      }

      const config = args.adapterConfig ?? {};
      const result = validateAdapterConfig(adapter.configSchema, config);
      if (!result.valid)
        throw new GraphQLError(`adapterConfig invalid: ${result.errors.join("; ")}`, {
          extensions: { code: "BAD_USER_INPUT", errors: result.errors },
        });

      await ctx.prisma.agent.update({
        where: { id: agent.id },
        data: { adapterType: adapter.type, adapterConfig: config },
      });
      return ctx.prisma.agent.findUniqueOrThrow({ ...query, where: { id: agent.id } });
    },
  }),
);
