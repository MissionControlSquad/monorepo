import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
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
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
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
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return getTaskAttachmentDownloadUrl(tenancy.workspaceId, args.id);
    },
  }),
);
