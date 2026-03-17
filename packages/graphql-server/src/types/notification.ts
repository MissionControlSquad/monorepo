import { builder } from "../builder";

builder.prismaObject("Notification", {
  fields: (t) => ({
    id: t.exposeID("id"),
    mentionedAgentId: t.exposeString("mentionedAgentId"),
    content: t.exposeString("content"),
    taskId: t.exposeString("taskId", { nullable: true }),
    messageId: t.exposeString("messageId", { nullable: true }),
    delivered: t.exposeBoolean("delivered"),
    deliveredAt: t.expose("deliveredAt", { type: "DateTime", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),

    mentionedAgent: t.relation("mentionedAgent"),
    task: t.relation("task", { nullable: true }),
    message: t.relation("message", { nullable: true }),
  }),
});
