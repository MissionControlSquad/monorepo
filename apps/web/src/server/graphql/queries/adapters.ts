import { builder } from "../builder";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { isFeatureEnabled } from "@/server/feature-flags";
import { listAdapters } from "@/server/adapters/registry";

// Epic #2: adapter registry reads. Any workspace member may view. The multi-provider feature
// only widens the list — openclaw-gateway (builtIn) is always visible so existing agents are
// always representable.
builder.queryField("agentAdapters", (t) =>
  t.prismaField({
    type: ["AgentAdapter"],
    args: { enabledOnly: t.arg.boolean() },
    resolve: async (query, _root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const featureEnabled = await isFeatureEnabled(FLAG_KEYS.MULTI_PROVIDER_ADAPTERS);
      // Reuse the registry's flag logic for the where-clause, then apply Pothos query selection.
      const rows = await listAdapters({ featureEnabled, enabledOnly: args.enabledOnly ?? false });
      const types = rows.map((r) => r.type);
      return ctx.prisma.agentAdapter.findMany({
        ...query,
        where: { type: { in: types } },
        orderBy: [{ builtIn: "desc" }, { displayName: "asc" }],
      });
    },
  }),
);

builder.queryField("adapterModelProfiles", (t) =>
  t.prismaField({
    type: ["AdapterModelProfile"],
    args: { adapterType: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return ctx.prisma.adapterModelProfile.findMany({
        ...query,
        where: { adapterType: args.adapterType },
        orderBy: [{ isDefault: "desc" }, { displayName: "asc" }],
      });
    },
  }),
);
