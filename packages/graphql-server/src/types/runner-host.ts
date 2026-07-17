import { builder } from "../builder";

// Tier D: a registered BYO server for direct server-side SSH. The private key is NEVER exposed —
// only its presence/metadata. Mirrors the secrets-vault read boundary.
builder.prismaObject("RunnerHost", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    name: t.exposeString("name"),
    host: t.exposeString("host"),
    port: t.exposeInt("port"),
    username: t.exposeString("username"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    // sshPrivateKey is deliberately NOT exposed.
  }),
});
