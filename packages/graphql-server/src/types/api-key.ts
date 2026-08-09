import { builder } from "../builder";

// Epic #12: API keys. keyHash is NEVER declared as a field — the secret hash is not exposed via the
// schema. The plaintext key is only ever returned once, from the mintApiKey mutation.
builder.prismaObject("ApiKey", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    name: t.exposeString("name"),
    keyPrefix: t.exposeString("keyPrefix"),
    createdByProfileId: t.exposeString("createdByProfileId", { nullable: true }),
    lastUsedAt: t.expose("lastUsedAt", { type: "DateTime", nullable: true }),
    revokedAt: t.expose("revokedAt", { type: "DateTime", nullable: true }),
    expiresAt: t.expose("expiresAt", { type: "DateTime", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
