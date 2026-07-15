import { builder } from "../builder";

// Epic #10: skills library + teams catalog types.
builder.prismaObject("Skill", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    key: t.exposeString("key"),
    slug: t.exposeString("slug"),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }),
    markdown: t.exposeString("markdown"),
    icon: t.exposeString("icon", { nullable: true }),
    color: t.exposeString("color", { nullable: true }),
    tagline: t.exposeString("tagline", { nullable: true }),
    author: t.exposeString("author", { nullable: true }),
    homepage: t.exposeString("homepage", { nullable: true }),
    sourceType: t.exposeString("sourceType"),
    trustLevel: t.exposeString("trustLevel"),
    categories: t.exposeStringList("categories"),
    sharingScope: t.exposeString("sharingScope"),
    forkedFromSkillId: t.exposeString("forkedFromSkillId", { nullable: true }),
    starCount: t.exposeInt("starCount"),
    installCount: t.exposeInt("installCount"),
    forkCount: t.exposeInt("forkCount"),
    currentVersion: t.exposeInt("currentVersion"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("SkillVersion", {
  fields: (t) => ({
    id: t.exposeID("id"),
    skillId: t.exposeString("skillId"),
    revisionNumber: t.exposeInt("revisionNumber"),
    label: t.exposeString("label", { nullable: true }),
    content: t.exposeString("content"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("AgentSkill", {
  fields: (t) => ({
    id: t.exposeID("id"),
    agentId: t.exposeString("agentId"),
    skillId: t.exposeString("skillId"),
    pinnedVersion: t.exposeInt("pinnedVersion", { nullable: true }),
    skill: t.relation("skill"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("Team", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    key: t.exposeString("key"),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }),
    icon: t.exposeString("icon", { nullable: true }),
    tagline: t.exposeString("tagline", { nullable: true }),
    author: t.exposeString("author", { nullable: true }),
    tags: t.exposeStringList("tags"),
    kind: t.exposeString("kind"),
    trustLevel: t.exposeString("trustLevel"),
    installCount: t.exposeInt("installCount"),
    members: t.relation("members", { query: { orderBy: { order: "asc" } } }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("TeamMember", {
  fields: (t) => ({
    id: t.exposeID("id"),
    teamId: t.exposeString("teamId"),
    name: t.exposeString("name"),
    role: t.exposeString("role"),
    templateId: t.exposeString("templateId", { nullable: true }),
    skills: t.exposeStringList("skills"),
    order: t.exposeInt("order"),
  }),
});

builder.prismaObject("TeamInstall", {
  fields: (t) => ({
    id: t.exposeID("id"),
    teamId: t.exposeString("teamId"),
    collisionStrategy: t.exposeString("collisionStrategy"),
    createdAgentIds: t.exposeStringList("createdAgentIds"),
    installedAt: t.expose("installedAt", { type: "DateTime" }),
  }),
});
