import { builder } from "../builder";

// Domain 14 #10: the Agent-Company entity.
builder.prismaObject("AgentCompany", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    slug: t.exposeString("slug"),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }),
    goals: t.exposeStringList("goals"),
    schemaVersion: t.exposeString("schemaVersion"),
    license: t.exposeString("license", { nullable: true }),
    authors: t.expose("authors", { type: "JSON", nullable: true }),
    sourceRef: t.exposeString("sourceRef", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});
