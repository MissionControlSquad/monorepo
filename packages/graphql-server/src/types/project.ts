import { builder } from "../builder";
import { ProjectMemberStatus } from "@agentcenter/utils";

builder.prismaObject("Project", {
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }),
    status: t.exposeString("status"),
    shutdownActive: t.exposeBoolean("shutdownActive"),
    defaultGoalId: t.exposeString("goalId", { nullable: true }), // Epic #11b
    sourceType: t.exposeString("sourceType", { nullable: true }), // source config
    repoUrl: t.exposeString("repoUrl", { nullable: true }),
    repoRef: t.exposeString("repoRef", { nullable: true }),
    visibility: t.exposeString("visibility"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),

    members: t.relation("members", {
      query: () => ({ where: { status: ProjectMemberStatus.ACTIVE } }),
    }),
    tasks: t.relation("tasks"),
    projectDocs: t.relation("projectDocs"),
  }),
});

builder.prismaObject("ProjectMember", {
  fields: (t) => ({
    id: t.exposeID("id"),
    projectId: t.exposeString("projectId"),
    profileId: t.exposeString("profileId"),
    status: t.exposeString("status"),
    joinedAt: t.expose("joinedAt", { type: "DateTime" }),

    project: t.relation("project"),
    profile: t.relation("profile"),
  }),
});
