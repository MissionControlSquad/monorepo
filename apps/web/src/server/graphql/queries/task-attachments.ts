import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import {
  listTaskAttachments,
  getTaskAttachmentDownloadUrl,
} from "@/server/services/task-attachments";

// Task attachments (parity). ASSETS-gated, member read, workspace-scoped.
builder.queryField("taskAttachments", (t) =>
  t.prismaField({
    type: ["TaskAttachment"],
    args: { taskId: t.arg.string({ required: true }) },
    resolve: async (_query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ASSETS);
      const tenancy = requireRole(ctx, "member");
      return listTaskAttachments(tenancy.workspaceId, args.taskId);
    },
  }),
);

builder.queryField("taskAttachmentDownloadUrl", (t) =>
  t.field({
    type: "String",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ASSETS);
      const tenancy = requireRole(ctx, "member");
      return getTaskAttachmentDownloadUrl(tenancy.workspaceId, args.id);
    },
  }),
);
