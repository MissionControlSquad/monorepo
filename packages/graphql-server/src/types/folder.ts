import { builder } from "../builder";

// Folders (parity #64): nestable organization tree + generic item placement.
builder.prismaObject("Folder", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    name: t.exposeString("name"),
    parentFolderId: t.exposeString("parentFolderId", { nullable: true }),
    order: t.exposeInt("order"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("FolderItem", {
  fields: (t) => ({
    id: t.exposeID("id"),
    folderId: t.exposeString("folderId"),
    itemType: t.exposeString("itemType"),
    itemId: t.exposeString("itemId"),
    addedAt: t.expose("addedAt", { type: "DateTime" }),
  }),
});
