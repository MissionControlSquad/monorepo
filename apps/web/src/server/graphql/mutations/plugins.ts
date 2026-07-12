import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { installPlugin, setPluginEnabled, uninstallPlugin } from "@/server/services/plugins";

// Epic #6: plugin registry mutations. admin only (install/enable/uninstall are privileged);
// PLUGIN_SDK-gated (off by default). No runtime — installing records inert metadata (spec D2).
builder.mutationField("installPlugin", (t) =>
  t.prismaField({
    type: "Plugin",
    args: { manifest: t.arg({ type: "JSON", required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PLUGIN_SDK);
      const tenancy = requireRole(ctx, "admin");
      const plugin = await installPlugin(tenancy.workspaceId, args.manifest, tenancy.userId);
      return ctx.prisma.plugin.findUniqueOrThrow({ ...query, where: { id: plugin.id } });
    },
  }),
);

builder.mutationField("setPluginEnabled", (t) =>
  t.prismaField({
    type: "Plugin",
    args: {
      pluginId: t.arg.string({ required: true }),
      enabled: t.arg.boolean({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PLUGIN_SDK);
      const tenancy = requireRole(ctx, "admin");
      const plugin = await setPluginEnabled(tenancy.workspaceId, args.pluginId, args.enabled);
      return ctx.prisma.plugin.findUniqueOrThrow({ ...query, where: { id: plugin.id } });
    },
  }),
);

builder.mutationField("uninstallPlugin", (t) =>
  t.field({
    type: "Boolean",
    args: { pluginId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PLUGIN_SDK);
      const tenancy = requireRole(ctx, "admin");
      return uninstallPlugin(tenancy.workspaceId, args.pluginId);
    },
  }),
);
