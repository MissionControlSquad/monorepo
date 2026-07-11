import { builder } from "../builder";

builder.prismaObject("Task", {
  fields: (t) => ({
    id: t.exposeID("id"),
    title: t.exposeString("title"),
    description: t.exposeString("description"),
    status: t.exposeString("status"),
    priority: t.exposeString("priority", { nullable: true }),
    createdByProfileId: t.exposeString("createdByProfileId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    dueDate: t.expose("dueDate", { type: "DateTime", nullable: true }),
    tags: t.exposeStringList("tags"),
    taskNumber: t.exposeInt("taskNumber"),
    parentTaskId: t.exposeString("parentTaskId", { nullable: true }),
    projectId: t.exposeString("projectId", { nullable: true }),
    blockedByTaskId: t.exposeString("blockedByTaskId", { nullable: true }),
    recurringTaskId: t.exposeString("recurringTaskId", { nullable: true }),

    // Epic #8: lease checkout (token intentionally NOT exposed).
    checkedOutByProfileId: t.exposeString("checkedOutByProfileId", { nullable: true }),
    checkedOutAt: t.expose("checkedOutAt", { type: "DateTime", nullable: true }),
    checkoutLeaseExpiresAt: t.expose("checkoutLeaseExpiresAt", { type: "DateTime", nullable: true }),

    // Relations
    createdByProfile: t.relation("createdByProfile", { nullable: true }),
    parentTask: t.relation("parentTask", { nullable: true }),
    childTasks: t.relation("childTasks"),
    blockedByTask: t.relation("blockedByTask", { nullable: true }),
    blockingTasks: t.relation("blockingTasks"),
    recurringTask: t.relation("recurringTask", { nullable: true }),
    project: t.relation("project", { nullable: true }),
    assignees: t.relation("assignees"),
    messages: t.relation("messages"),
    deliverables: t.relation("deliverables"),
    activities: t.relation("activities"),
    workSessions: t.relation("workSessions"),
    agentActions: t.relation("agentActions"),
    documents: t.relation("documents"),
  }),
});
