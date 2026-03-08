import { builder } from "../builder";

builder.prismaObject("StatusHistory", {
  fields: (t) => ({
    id: t.exposeID("id"),
    agentId: t.exposeString("agentId"),
    fromStatus: t.exposeString("fromStatus"),
    toStatus: t.exposeString("toStatus"),
    fromDetailedStatus: t.exposeString("fromDetailedStatus", { nullable: true }),
    toDetailedStatus: t.exposeString("toDetailedStatus", { nullable: true }),
    statusMessage: t.exposeString("statusMessage", { nullable: true }),
    timestamp: t.expose("timestamp", { type: "DateTime" }),

    agent: t.relation("agent"),
  }),
});
