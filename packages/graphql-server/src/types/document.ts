import { builder } from "../builder";

builder.prismaObject("Document", {
  fields: (t) => ({
    id: t.exposeID("id"),
    title: t.exposeString("title"),
    content: t.exposeString("content"),
    type: t.exposeString("type"),
    taskId: t.exposeString("taskId", { nullable: true }),
    projectId: t.exposeString("projectId", { nullable: true }),
    createdById: t.exposeString("createdById", { nullable: true }),
    createdByProfileId: t.exposeString("createdByProfileId", { nullable: true }),
    storageKey: t.exposeString("storageKey", { nullable: true }),
    fileName: t.exposeString("fileName", { nullable: true }),
    mimeType: t.exposeString("mimeType", { nullable: true }),
    fileSize: t.exposeInt("fileSize", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),

    createdBy: t.relation("createdBy", { nullable: true }),
    createdByProfile: t.relation("createdByProfile", { nullable: true }),
    task: t.relation("task", { nullable: true }),
    project: t.relation("project", { nullable: true }),
    revisions: t.relation("revisions"), // Parity §3.12 — revision history
  }),
});

// Parity §3.12 — generic document revision (content snapshot on update).
builder.prismaObject("DocumentRevision", {
  fields: (t) => ({
    id: t.exposeID("id"),
    documentId: t.exposeString("documentId"),
    revision: t.exposeInt("revision"),
    title: t.exposeString("title"),
    content: t.exposeString("content"),
    authorProfileId: t.exposeString("authorProfileId", { nullable: true }),
    authorAgentId: t.exposeString("authorAgentId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
