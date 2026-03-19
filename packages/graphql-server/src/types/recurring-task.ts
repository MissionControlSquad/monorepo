import { builder } from "../builder";

builder.prismaObject("RecurringTask", {
  fields: (t) => ({
    id: t.exposeID("id"),
    title: t.exposeString("title"),
    description: t.exposeString("description"),
    status: t.exposeString("status"),
    priority: t.exposeString("priority", { nullable: true }),
    tags: t.exposeStringList("tags"),
    recurrenceConfig: t.expose("recurrenceConfig", { type: "JSON" }),
    isActive: t.exposeBoolean("isActive"),
    timezone: t.exposeString("timezone"),
    nextDueAt: t.expose("nextDueAt", { type: "DateTime", nullable: true }),
    lastGeneratedAt: t.expose("lastGeneratedAt", { type: "DateTime", nullable: true }),
    createdByProfileId: t.exposeString("createdByProfileId", { nullable: true }),
    projectId: t.exposeString("projectId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),

    // Relations
    createdByProfile: t.relation("createdByProfile", { nullable: true }),
    project: t.relation("project", { nullable: true }),
    assignees: t.relation("assignees"),
    generatedTasks: t.relation("generatedTasks"),
  }),
});

builder.prismaObject("RecurringTaskAssignee", {
  fields: (t) => ({
    id: t.exposeID("id"),
    recurringTaskId: t.exposeString("recurringTaskId"),
    profileId: t.exposeString("profileId"),
    assignedAt: t.expose("assignedAt", { type: "DateTime" }),

    recurringTask: t.relation("recurringTask"),
    profile: t.relation("profile"),
  }),
});
