import { builder } from "../builder";

// Epic #17: cases domain types.
builder.prismaObject("Case", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    projectId: t.exposeString("projectId", { nullable: true }),
    caseNumber: t.exposeInt("caseNumber"),
    identifier: t.exposeString("identifier"),
    caseType: t.exposeString("caseType"),
    key: t.exposeString("key", { nullable: true }),
    title: t.exposeString("title"),
    summary: t.exposeString("summary", { nullable: true }),
    status: t.exposeString("status"),
    fields: t.expose("fields", { type: "JSON" }),
    parentCaseId: t.exposeString("parentCaseId", { nullable: true }),
    completedAt: t.expose("completedAt", { type: "DateTime", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    taskLinks: t.relation("taskLinks"),
    labels: t.relation("labels"),
    documents: t.relation("documents"),
  }),
});

builder.prismaObject("CaseTaskLink", {
  fields: (t) => ({
    id: t.exposeID("id"),
    caseId: t.exposeString("caseId"),
    taskId: t.exposeString("taskId"),
    role: t.exposeString("role"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("CaseEvent", {
  fields: (t) => ({
    id: t.exposeID("id"),
    caseId: t.exposeString("caseId"),
    kind: t.exposeString("kind"),
    actorType: t.exposeString("actorType"),
    actorProfileId: t.exposeString("actorProfileId", { nullable: true }),
    payload: t.expose("payload", { type: "JSON", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("CaseDocument", {
  fields: (t) => ({
    id: t.exposeID("id"),
    caseId: t.exposeString("caseId"),
    documentId: t.exposeString("documentId"),
    key: t.exposeString("key"),
    document: t.relation("document"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("Label", {
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    color: t.exposeString("color"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("CaseLabel", {
  fields: (t) => ({
    id: t.exposeID("id"),
    caseId: t.exposeString("caseId"),
    labelId: t.exposeString("labelId"),
    label: t.relation("label"),
  }),
});
