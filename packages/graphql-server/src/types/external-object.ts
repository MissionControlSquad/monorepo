import { builder } from "../builder";
builder.prismaObject("ExternalObject", {
  fields: (t) => ({
    id: t.exposeID("id"),
    provider: t.exposeString("provider"),
    objectType: t.exposeString("objectType"),
    externalId: t.exposeString("externalId"),
    url: t.exposeString("url"),
    title: t.exposeString("title", { nullable: true }),
    state: t.exposeString("state", { nullable: true }),
    linkedType: t.exposeString("linkedType", { nullable: true }),
    linkedId: t.exposeString("linkedId", { nullable: true }),
    fetchedAt: t.expose("fetchedAt", { type: "DateTime" }),
  }),
});
