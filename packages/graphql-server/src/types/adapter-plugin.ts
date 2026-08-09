import { builder } from "../builder";
builder.prismaObject("AdapterPlugin", {
  fields: (t) => ({
    id: t.exposeID("id"), key: t.exposeString("key"), displayName: t.exposeString("displayName", { nullable: true }),
    base: t.exposeString("base"), models: t.exposeStringList("models"), supportsModel: t.exposeBoolean("supportsModel"),
    enabled: t.exposeBoolean("enabled"),
  }),
});
