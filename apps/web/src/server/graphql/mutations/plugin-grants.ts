import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { grantPluginCapability, revokePluginCapability } from "@/server/services/plugin-grants";
import { dispatchPluginTool } from "@/server/services/plugin-runtime";

// Plugin EXECUTION runtime mutations (parity #103/#127). All PLUGIN_RUNTIME-gated (off by default) and
// admin-only — granting a capability is a privileged, security-relevant action. Fail-closed: a plugin
// cannot exercise a capability until it is granted here.

builder.mutationField("grantPluginCapability", (t) =>
  t.prismaField({
    type: "PluginGrant",
    args: {
      pluginId: t.arg.string({ required: true }),
      capability: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PLUGIN_RUNTIME);
      const tenancy = requireRole(ctx, "admin");
      const grant = await grantPluginCapability({
        workspaceId: tenancy.workspaceId,
        pluginId: args.pluginId,
        capability: args.capability,
        grantedByProfileId: tenancy.userId,
      });
      return ctx.prisma.pluginGrant.findUniqueOrThrow({ ...query, where: { id: grant.id } });
    },
  }),
);

builder.mutationField("revokePluginCapability", (t) =>
  t.field({
    type: "Boolean",
    args: {
      pluginId: t.arg.string({ required: true }),
      capability: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PLUGIN_RUNTIME);
      const tenancy = requireRole(ctx, "admin");
      return revokePluginCapability(tenancy.workspaceId, args.pluginId, args.capability);
    },
  }),
);

// Dispatch a plugin tool into its worker (admin/dev surface). Capability-checked + fail-closed inside
// the runtime; returns the tool result as JSON.
builder.mutationField("dispatchPluginTool", (t) =>
  t.field({
    type: "JSON",
    args: {
      toolName: t.arg.string({ required: true }),
      args: t.arg({ type: "JSON", required: false }),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PLUGIN_RUNTIME);
      const tenancy = requireRole(ctx, "admin");
      return dispatchPluginTool(tenancy.workspaceId, args.toolName, args.args ?? {});
    },
  }),
);
