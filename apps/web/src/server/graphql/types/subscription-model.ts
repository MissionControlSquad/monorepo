import { builder } from "../builder";

builder.prismaObject("Subscription", {
  name: "TaskSubscription",
  fields: (t) => ({
    id: t.exposeID("id"),
    agentId: t.exposeString("agentId"),
    taskId: t.exposeString("taskId"),
    subscribedAt: t.expose("subscribedAt", { type: "DateTime" }),

    agent: t.relation("agent"),
    task: t.relation("task"),
  }),
});
