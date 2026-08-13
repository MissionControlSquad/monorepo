import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { roleAtLeast } from "@/server/tenancy/roles";
import {
  presignTaskAttachment,
  confirmTaskAttachment,
  deleteTaskAttachment,
} from "@/server/services/task-attachments";

// Task attachments (parity). ASSETS-gated. Two-step presigned R2 upload: presignTaskAttachment (member)
// -> client PUTs to R2 -> confirmTaskAttachment (member). Delete is author-or-admin.
const TaskAttachmentUpload = builder.simpleObject("TaskAttachmentUpload", {
  fields: (t) => ({
    attachmentId: t.string(),
    storageKey: t.string(),
    uploadUrl: t.string(),
  }),
});

builder.mutationField("presignTaskAttachment", (t) =>
  t.field({
    type: TaskAttachmentUpload,
    args: {
      taskId: t.arg.string({ required: true }),
      fileName: t.arg.string({ required: true }),
      contentType: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ASSETS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const { attachment, uploadUrl } = await presignTaskAttachment({
        workspaceId: tenancy.workspaceId,
        taskId: args.taskId,
        fileName: args.fileName,
        contentType: args.contentType,
        uploadedByProfileId: tenancy.userId,
      });
      return { attachmentId: attachment.id, storageKey: attachment.storageKey, uploadUrl };
    },
  }),
);

builder.mutationField("confirmTaskAttachment", (t) =>
  t.prismaField({
    type: "TaskAttachment",
    args: { id: t.arg.string({ required: true }), byteSize: t.arg.int() },
    resolve: async (_query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ASSETS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return confirmTaskAttachment(tenancy.workspaceId, args.id, args.byteSize ?? undefined);
    },
  }),
);

builder.mutationField("deleteTaskAttachment", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ASSETS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return deleteTaskAttachment(tenancy.workspaceId, args.id, {
        requesterProfileId: tenancy.userId,
        isAdmin: roleAtLeast(tenancy.role, WORKSPACE_ROLES.ADMIN),
      });
    },
  }),
);
