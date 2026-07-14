import { builder } from "../builder";

// Epic #6: plugin registry (install-time contract; runtime deferred). Capabilities are DECLARED
// metadata, not granted.
builder.prismaObject("Plugin", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    pluginId: t.exposeString("pluginId"),
    name: t.exposeString("name"),
    version: t.exposeString("version"),
    displayName: t.exposeString("displayName"),
    description: t.exposeString("description", { nullable: true }),
    category: t.exposeString("category"),
    capabilities: t.exposeStringList("capabilities"),
    status: t.exposeString("status"),
    enabled: t.exposeBoolean("enabled"),
    manifest: t.expose("manifest", { type: "JSON" }),
    config: t.expose("config", { type: "JSON", nullable: true }),
    lastError: t.exposeString("lastError", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});
