import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { GraphQLError } from "graphql";
import { FLAG_KEYS, isMemoryProvider } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { setCompanyDefaultMemoryProvider, forgetAgentMemory } from "@/server/services/agent-memory";

// Tier D: bind an agent's memory provider (none | markdown | db). MEMORY-gated, admin.
builder.mutationField("setAgentMemoryProvider", (t) =>
  t.prismaField({
    type: "Agent",
    args: {
      agentId: t.arg.string({ required: true }),
      provider: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.MEMORY);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      if (!isMemoryProvider(args.provider))
        throw new GraphQLError(`Unknown memory provider: ${args.provider}`, {
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
        data: { memoryProvider: args.provider },
      });
    },
  }),
);

// GAP-C: set the company-wide default memory provider. Resolution order is agent override → this
// default → none. MEMORY-gated, admin. Returns the new default.
builder.mutationField("setCompanyMemoryProvider", (t) =>
  t.string({
    args: {
      provider: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.MEMORY);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      if (!isMemoryProvider(args.provider))
        throw new GraphQLError(`Unknown memory provider: ${args.provider}`, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      return setCompanyDefaultMemoryProvider(tenancy.workspaceId, args.provider, tenancy.userId);
    },
  }),
);

// Domain 4 GAP-F: forget a single memory entry. MEMORY-gated, admin.
builder.mutationField("forgetAgentMemory", (t) =>
  t.boolean({
    args: { agentId: t.arg.string({ required: true }), memoryId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.MEMORY);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return forgetAgentMemory(tenancy.workspaceId, args.agentId, args.memoryId);
    },
  }),
);
