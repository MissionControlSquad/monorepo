import { builder } from "../builder";

builder.prismaObject("CloudVM", {
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name", { nullable: true }),
    status: t.exposeString("status"),
    ipv4: t.exposeString("ipv4", { nullable: true }),
    region: t.exposeString("region"),
    serverType: t.exposeString("serverType"),
    llmConfigured: t.exposeBoolean("llmConfigured"),
    llmProvider: t.exposeString("llmProvider", { nullable: true }),
    llmModel: t.exposeString("llmModel", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
