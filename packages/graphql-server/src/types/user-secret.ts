import { builder } from "../builder";

// Parity §3 #7: user-scoped secret definitions + declarations. SECURITY: like every secrets type,
// nothing here exposes a plaintext value or ciphertext — only what a member is expected to provide
// (definition) and whether they have (declaration status). Values live solely in the personal Secret.
builder.prismaObject("UserSecretDefinition", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    key: t.exposeString("key"),
    displayName: t.exposeString("displayName"),
    description: t.exposeString("description", { nullable: true }),
    required: t.exposeBoolean("required"),
    createdByProfileId: t.exposeString("createdByProfileId"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("UserSecretDeclaration", {
  fields: (t) => ({
    id: t.exposeID("id"),
    definitionId: t.exposeString("definitionId"),
    profileId: t.exposeString("profileId"),
    status: t.exposeString("status"),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    definition: t.relation("definition"),
    // secretId/secretVersionId intentionally NOT exposed — the value pointer stays server-side.
  }),
});
