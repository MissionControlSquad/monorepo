import { builder } from "../builder";

// Plugin runtime capability grant (parity #103). A row here means an admin explicitly granted the plugin
// a capability; the execution runtime is fail-closed without it. Read/managed via PLUGIN_RUNTIME-gated,
// admin-only resolvers.
builder.prismaObject("PluginGrant", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    pluginId: t.exposeString("pluginId"),
    capability: t.exposeString("capability"),
    grantedByProfileId: t.exposeString("grantedByProfileId", { nullable: true }),
    grantedAt: t.expose("grantedAt", { type: "DateTime" }),
  }),
});
