import { builder } from "../builder";

// Epic #2: agent adapter registry types (global platform config).
builder.prismaObject("AgentAdapter", {
  fields: (t) => ({
    id: t.exposeID("id"),
    type: t.exposeString("type"),
    displayName: t.exposeString("displayName"),
    transport: t.exposeString("transport"),
    authKind: t.exposeString("authKind"),
    configSchema: t.expose("configSchema", { type: "JSON" }),
    version: t.exposeString("version"),
    enabled: t.exposeBoolean("enabled"),
    builtIn: t.exposeBoolean("builtIn"),
    modelProfiles: t.relation("modelProfiles"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("AdapterModelProfile", {
  fields: (t) => ({
    id: t.exposeID("id"),
    adapterType: t.exposeString("adapterType"),
    modelId: t.exposeString("modelId"),
    displayName: t.exposeString("displayName"),
    contextWindow: t.exposeInt("contextWindow", { nullable: true }),
    isDefault: t.exposeBoolean("isDefault"),
    detected: t.exposeBoolean("detected"),
    metadata: t.expose("metadata", { type: "JSON", nullable: true }),
  }),
});
