import { builder } from "../builder";

builder.prismaObject("WorkSession", {
  fields: (t) => ({
    id: t.exposeID("id"),
    taskId: t.exposeString("taskId"),
    agentId: t.exposeString("agentId"),
    projectId: t.exposeString("projectId", { nullable: true }),
    startedAt: t.expose("startedAt", { type: "DateTime" }),
    endedAt: t.expose("endedAt", { type: "DateTime", nullable: true }),
    duration: t.exposeInt("duration", { nullable: true }),
    eventType: t.exposeString("eventType"),

    task: t.relation("task"),
    agent: t.relation("agent"),
    project: t.relation("project", { nullable: true }),
  }),
});
