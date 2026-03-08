import { builder } from "../builder";

builder.prismaObject("TaskAssignee", {
  fields: (t) => ({
    id: t.exposeID("id"),
    taskId: t.exposeString("taskId"),
    profileId: t.exposeString("profileId"),
    assignedAt: t.expose("assignedAt", { type: "DateTime" }),

    task: t.relation("task"),
    profile: t.relation("profile"),
  }),
});
