import { builder } from "../builder";

// Epic #5: secrets vault types. SECURITY: no type here EVER exposes a plaintext value or the
// ciphertext — only metadata. Values leave the server solely via the audited resolve/inject path.
builder.prismaObject("Secret", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }),
    providerId: t.exposeString("providerId", { nullable: true }),
    currentVersion: t.exposeInt("currentVersion"),
    status: t.exposeString("status"),
    createdBy: t.exposeString("createdBy", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    provider: t.relation("provider", { nullable: true }),
    versions: t.relation("versions"),
    bindings: t.relation("bindings"),
    // accessEvents intentionally not a default relation — fetched via the scoped query.
  }),
});

builder.prismaObject("SecretVersion", {
  fields: (t) => ({
    id: t.exposeID("id"),
    version: t.exposeInt("version"),
    keyId: t.exposeString("keyId"),
    createdBy: t.exposeString("createdBy", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    retiredAt: t.expose("retiredAt", { type: "DateTime", nullable: true }),
    // ciphertext NEVER exposed.
  }),
});

builder.prismaObject("SecretBinding", {
  fields: (t) => ({
    id: t.exposeID("id"),
    secretId: t.exposeString("secretId"),
    scope: t.exposeString("scope"),
    agentId: t.exposeString("agentId", { nullable: true }),
    adapterType: t.exposeString("adapterType", { nullable: true }),
    envVarName: t.exposeString("envVarName"),
    pinnedVersion: t.exposeInt("pinnedVersion", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("SecretAccessEvent", {
  fields: (t) => ({
    id: t.exposeID("id"),
    action: t.exposeString("action"),
    actorType: t.exposeString("actorType"),
    actorId: t.exposeString("actorId", { nullable: true }),
    agentId: t.exposeString("agentId", { nullable: true }),
    version: t.exposeInt("version", { nullable: true }),
    metadata: t.expose("metadata", { type: "JSON", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("SecretProviderConfig", {
  fields: (t) => ({
    id: t.exposeID("id"),
    kind: t.exposeString("kind"),
    name: t.exposeString("name"),
    config: t.expose("config", { type: "JSON" }), // non-secret settings only
    healthy: t.exposeBoolean("healthy"),
    lastCheckedAt: t.expose("lastCheckedAt", { type: "DateTime", nullable: true }),
    lastError: t.exposeString("lastError", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});
