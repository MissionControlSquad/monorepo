import { builder } from "../builder";
builder.prismaObject("InboxPolicy", {
  fields: (t) => ({
    id: t.exposeID("id"),
    agentId: t.exposeString("agentId", { nullable: true }),
    itemKind: t.exposeString("itemKind"),
    action: t.exposeString("action"),
    priority: t.exposeInt("priority"),
    enabled: t.exposeBoolean("enabled"),
  }),
});
