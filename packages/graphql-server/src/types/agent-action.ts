import { builder } from "../builder";

builder.prismaObject("AgentAction", {
  fields: (t) => ({
    id: t.exposeID("id"),
    agentId: t.exposeString("agentId"),
    taskId: t.exposeString("taskId", { nullable: true }),
    projectId: t.exposeString("projectId", { nullable: true }),
    actionType: t.exposeString("actionType"),
    description: t.exposeString("description"),
    metadata: t.expose("metadata", { type: "JSON", nullable: true }),
    timestamp: t.expose("timestamp", { type: "DateTime" }),

    agent: t.relation("agent"),
    task: t.relation("task", { nullable: true }),
    project: t.relation("project", { nullable: true }),
  }),
});
