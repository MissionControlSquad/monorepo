import { builder } from "../builder";

builder.prismaObject("Activity", {
  fields: (t) => ({
    id: t.exposeID("id"),
    type: t.exposeString("type"),
    profileId: t.exposeString("profileId", { nullable: true }),
    taskId: t.exposeString("taskId", { nullable: true }),
    projectId: t.exposeString("projectId", { nullable: true }),
    message: t.exposeString("message"),
    metadata: t.expose("metadata", { type: "JSON", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),

    profile: t.relation("profile", { nullable: true }),
    task: t.relation("task", { nullable: true }),
    project: t.relation("project", { nullable: true }),
  }),
});

/** Cursor-based pagination wrapper for activities. */
export const ActivityConnectionRef = builder
  .objectRef<{
    activities: unknown[];
    hasMore: boolean;
  }>("ActivityConnection")
  .implement({
    fields: (t) => ({
      activities: t.field({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Pothos custom object referencing Prisma list type
        type: ["Activity"] as any,
        resolve: (parent) => parent.activities,
      }),
      hasMore: t.boolean({
        resolve: (parent) => parent.hasMore,
      }),
    }),
  });
