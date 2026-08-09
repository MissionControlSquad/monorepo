import { builder } from "../builder";

builder.prismaObject("ProjectDoc", {
  fields: (t) => ({
    id: t.exposeID("id"),
    projectId: t.exposeString("projectId"),
    title: t.exposeString("title"),
    summary: t.exposeString("summary", { nullable: true }),
    content: t.exposeString("content"),
    addedById: t.exposeString("addedById", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),

    project: t.relation("project"),
    addedBy: t.relation("addedBy", { nullable: true }),
    revisions: t.relation("revisions"),
  }),
});

builder.prismaObject("ProjectDocComment", {
  fields: (t) => ({
    id: t.exposeID("id"),
    docId: t.exposeString("docId"),
    body: t.exposeString("body"),
    quote: t.exposeString("quote", { nullable: true }),
    resolved: t.exposeBoolean("resolved"),
    authorProfileId: t.exposeString("authorProfileId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("ProjectDocRevision", {
  fields: (t) => ({
    id: t.exposeID("id"),
    docId: t.exposeString("docId"),
    title: t.exposeString("title"),
    summary: t.exposeString("summary", { nullable: true }),
    content: t.exposeString("content"),
    editedById: t.exposeString("editedById", { nullable: true }),
    editAction: t.exposeString("editAction"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),

    doc: t.relation("doc"),
    editedBy: t.relation("editedBy", { nullable: true }),
  }),
});
