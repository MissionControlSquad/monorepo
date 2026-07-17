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
    // null = user-registered BYO; "hetzner" = we provisioned it. Non-sensitive.
    provider: t.exposeString("provider", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    // sshPrivateKey + externalServerId are deliberately NOT exposed.
  }),
});
