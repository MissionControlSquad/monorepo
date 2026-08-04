import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { listFolders, listFolderItems } from "@/server/services/folders";

// Folders reads (parity #64). FOLDERS-gated, member+, workspace-scoped.
builder.queryField("folders", (t) =>
  t.prismaField({
    type: ["Folder"],
    resolve: async (_q, _r, _args, ctx) => {
      await requireFeature(FLAG_KEYS.FOLDERS);
      const tenancy = requireRole(ctx, "member");
      void _q;
      return listFolders(tenancy.workspaceId);
    },
  }),
);

builder.queryField("folderItems", (t) =>
  t.prismaField({
    type: ["FolderItem"],
    args: { folderId: t.arg.string({ required: true }) },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.FOLDERS);
      const tenancy = requireRole(ctx, "member");
      void _q;
      return listFolderItems(tenancy.workspaceId, args.folderId);
    },
  }),
);
