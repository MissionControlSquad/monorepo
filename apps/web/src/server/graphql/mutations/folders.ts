import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import {
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
  addFolderItem,
  removeFolderItem,
} from "@/server/services/folders";

// Folders mutations (parity #64). FOLDERS-gated; mutations admin-gated (org structure).
builder.mutationField("createFolder", (t) =>
  t.prismaField({
    type: "Folder",
    args: { name: t.arg.string({ required: true }), parentFolderId: t.arg.string() },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.FOLDERS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return createFolder({
        workspaceId: tenancy.workspaceId,
        name: args.name,
        parentFolderId: args.parentFolderId ?? null,
        createdByProfileId: tenancy.userId,
      });
    },
  }),
);

builder.mutationField("renameFolder", (t) =>
  t.prismaField({
    type: "Folder",
    args: { id: t.arg.string({ required: true }), name: t.arg.string({ required: true }) },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.FOLDERS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return renameFolder(tenancy.workspaceId, args.id, args.name);
    },
  }),
);

builder.mutationField("moveFolder", (t) =>
  t.prismaField({
    type: "Folder",
    args: { id: t.arg.string({ required: true }), parentFolderId: t.arg.string() },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.FOLDERS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return moveFolder(tenancy.workspaceId, args.id, args.parentFolderId ?? null);
    },
  }),
);

builder.mutationField("deleteFolder", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_r, args, ctx) => {
      await requireFeature(FLAG_KEYS.FOLDERS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return deleteFolder(tenancy.workspaceId, args.id);
    },
  }),
);

builder.mutationField("addFolderItem", (t) =>
  t.prismaField({
    type: "FolderItem",
    args: {
      folderId: t.arg.string({ required: true }),
      itemType: t.arg.string({ required: true }),
      itemId: t.arg.string({ required: true }),
    },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.FOLDERS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return addFolderItem(tenancy.workspaceId, args.folderId, args.itemType, args.itemId);
    },
  }),
);

builder.mutationField("removeFolderItem", (t) =>
  t.field({
    type: "Boolean",
    args: {
      folderId: t.arg.string({ required: true }),
      itemType: t.arg.string({ required: true }),
      itemId: t.arg.string({ required: true }),
    },
    resolve: async (_r, args, ctx) => {
      await requireFeature(FLAG_KEYS.FOLDERS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return removeFolderItem(tenancy.workspaceId, args.folderId, args.itemType, args.itemId);
    },
  }),
);
