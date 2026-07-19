import { builder } from "../builder";

// Epic #14: workspace import audit record. The bundle itself is a JSON scalar (not a type) — only
// the import audit is persisted.
builder.prismaObject("WorkspaceImport", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    bundleVersion: t.exposeInt("bundleVersion"),
    collisionStrategy: t.exposeString("collisionStrategy"),
    createdAgentIds: t.exposeStringList("createdAgentIds"),
    createdProjectIds: t.exposeStringList("createdProjectIds"),
    createdSkillIds: t.exposeStringList("createdSkillIds"),
    summary: t.expose("summary", { type: "JSON" }),
    importedByProfileId: t.exposeString("importedByProfileId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
