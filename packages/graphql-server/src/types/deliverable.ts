import { builder } from "../builder";

builder.prismaObject("Deliverable", {
  fields: (t) => ({
    id: t.exposeID("id"),
    taskId: t.exposeString("taskId"),
    profileId: t.exposeString("profileId"),
    projectId: t.exposeString("projectId", { nullable: true }),
    title: t.exposeString("title"),
    kind: t.exposeString("kind"),
    content: t.exposeString("content", { nullable: true }),
    language: t.exposeString("language", { nullable: true }),
    storageKey: t.exposeString("storageKey", { nullable: true }),
    fileName: t.exposeString("fileName", { nullable: true }),
    mimeType: t.exposeString("mimeType", { nullable: true }),
    fileSize: t.exposeInt("fileSize", { nullable: true }),
    url: t.exposeString("url", { nullable: true }),
    version: t.exposeInt("version"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),

    task: t.relation("task"),
    profile: t.relation("profile"),
    project: t.relation("project", { nullable: true }),
    versions: t.relation("versions"),
  }),
});

builder.prismaObject("DeliverableVersion", {
  fields: (t) => ({
    id: t.exposeID("id"),
    deliverableId: t.exposeString("deliverableId"),
    version: t.exposeInt("version"),
    title: t.exposeString("title"),
    kind: t.exposeString("kind"),
    content: t.exposeString("content", { nullable: true }),
    language: t.exposeString("language", { nullable: true }),
    storageKey: t.exposeString("storageKey", { nullable: true }),
    fileName: t.exposeString("fileName", { nullable: true }),
    mimeType: t.exposeString("mimeType", { nullable: true }),
    fileSize: t.exposeInt("fileSize", { nullable: true }),
    url: t.exposeString("url", { nullable: true }),
    editedByProfileId: t.exposeString("editedByProfileId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),

    deliverable: t.relation("deliverable"),
    editedByProfile: t.relation("editedByProfile", { nullable: true }),
  }),
});
