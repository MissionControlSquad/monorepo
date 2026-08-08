import { builder } from "../builder";

// TaskAttachment (parity: agent/user attaches a produced file to a task). R2-backed via the shared
// `attachments/` prefix; two-step presigned upload (pending -> uploaded).
builder.prismaObject("TaskAttachment", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    taskId: t.exposeString("taskId"),
    storageKey: t.exposeString("storageKey"),
    fileName: t.exposeString("fileName"),
    contentType: t.exposeString("contentType"),
    byteSize: t.exposeInt("byteSize"),
    status: t.exposeString("status"),
    uploadedByProfileId: t.exposeString("uploadedByProfileId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
