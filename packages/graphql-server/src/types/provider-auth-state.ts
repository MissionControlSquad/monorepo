import { builder } from "../builder";
builder.prismaObject("ProviderAuthState", {
  fields: (t) => ({
    id: t.exposeID("id"),
    provider: t.exposeString("provider"),
    accountRef: t.exposeString("accountRef"),
    state: t.exposeString("state"),
    scopes: t.exposeStringList("scopes"),
    expiresAt: t.expose("expiresAt", { type: "DateTime", nullable: true }),
    lastCheckedAt: t.expose("lastCheckedAt", { type: "DateTime", nullable: true }),
  }),
});
