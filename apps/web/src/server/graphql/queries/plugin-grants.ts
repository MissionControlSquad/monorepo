import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole, scoped } from "@/server/tenancy";

// Plugin capability grants read (parity #103). PLUGIN_RUNTIME-gated, admin, workspace-scoped. Powers the
// plugin detail page's granted-capabilities panel.
builder.queryField("pluginGrants", (t) =>
  t.prismaField({
    type: ["PluginGrant"],
    args: { pluginId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PLUGIN_RUNTIME);
      requireRole(ctx, "admin");
      return ctx.prisma.pluginGrant.findMany({
        ...query,
        where: scoped(ctx, { pluginId: args.pluginId }),
        orderBy: { capability: "asc" },
      });
    },
  }),
);
