import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import {
  installPlugin,
  setPluginEnabled,
  uninstallPlugin,
  setPluginConfig,
  clearPluginError,
} from "@/server/services/plugins";

// Epic #6: plugin registry mutations. admin only (install/enable/uninstall are privileged);
// PLUGIN_SDK-gated (off by default). No runtime — installing records inert metadata (spec D2).
builder.mutationField("installPlugin", (t) =>
  t.prismaField({
    type: "Plugin",
    args: { manifest: t.arg({ type: "JSON", required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PLUGIN_SDK);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
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
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
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
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return uninstallPlugin(tenancy.workspaceId, args.pluginId);
    },
  }),
);

builder.mutationField("setPluginConfig", (t) =>
  t.prismaField({
    type: "Plugin",
    args: {
      pluginId: t.arg.string({ required: true }),
      config: t.arg({ type: "JSON", required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PLUGIN_SDK);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const plugin = await setPluginConfig(
        tenancy.workspaceId,
        args.pluginId,
        (args.config ?? {}) as Record<string, unknown>,
      );
      return ctx.prisma.plugin.findUniqueOrThrow({ ...query, where: { id: plugin.id } });
    },
  }),
);

builder.mutationField("clearPluginError", (t) =>
  t.prismaField({
    type: "Plugin",
    args: { pluginId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PLUGIN_SDK);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const plugin = await clearPluginError(tenancy.workspaceId, args.pluginId);
      return ctx.prisma.plugin.findUniqueOrThrow({ ...query, where: { id: plugin.id } });
    },
  }),
);
