import { builder } from "../builder";

// Epic #11: goals / OKRs. Hierarchical (parent/children), agent-owned.
builder.prismaObject("Goal", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    title: t.exposeString("title"),
    description: t.exposeString("description", { nullable: true }),
    level: t.exposeString("level"),
    status: t.exposeString("status"),
    parentId: t.exposeString("parentId", { nullable: true }),
    ownerAgentId: t.exposeString("ownerAgentId", { nullable: true }),
    ownerAgent: t.relation("ownerAgent", { nullable: true }),
    children: t.relation("children", { query: { orderBy: { createdAt: "asc" } } }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});
