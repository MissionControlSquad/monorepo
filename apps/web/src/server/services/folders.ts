import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { Folder, FolderItem } from "@agentcenter/database";

// Folders service (parity #64) — nestable organization tree + generic item placement. Workspace-scoped.

const ITEM_TYPES = new Set(["task", "project", "agent", "company"]);
const MAX_DEPTH = 10;

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}
function notFound(what: string): never {
  throw new GraphQLError(`${what} not found`, { extensions: { code: "NOT_FOUND" } });
}

async function requireFolder(workspaceId: string, id: string): Promise<Folder> {
  const folder = await prisma.folder.findFirst({ where: { id, workspaceId } });
  if (!folder) notFound("Folder");
  return folder;
}

/** Depth of a would-be child under `parentId` (0 = top-level). Guards against runaway nesting + cycles. */
async function depthOf(workspaceId: string, parentId: string | null): Promise<number> {
  let depth = 0;
  let cursor = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor)) badRequest("folder cycle detected");
    seen.add(cursor);
    const parent = await prisma.folder.findFirst({
      where: { id: cursor, workspaceId },
      select: { parentFolderId: true },
    });
    if (!parent) notFound("Parent folder");
    depth++;
    cursor = parent.parentFolderId;
  }
  return depth;
}

export async function createFolder(input: {
  workspaceId: string;
  name: string;
  parentFolderId?: string | null;
  createdByProfileId?: string | null;
}): Promise<Folder> {
  const name = input.name.trim();
  if (!name) badRequest("name is required");
  if (input.parentFolderId) {
    if ((await depthOf(input.workspaceId, input.parentFolderId)) >= MAX_DEPTH) {
      badRequest(`folders may not nest deeper than ${MAX_DEPTH}`);
    }
  }
  const order = await prisma.folder.count({
    where: { workspaceId: input.workspaceId, parentFolderId: input.parentFolderId ?? null },
  });
  return prisma.folder.create({
    data: {
      workspaceId: input.workspaceId,
      name,
      parentFolderId: input.parentFolderId ?? null,
      order,
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
}

export async function renameFolder(workspaceId: string, id: string, name: string): Promise<Folder> {
  await requireFolder(workspaceId, id);
  const trimmed = name.trim();
  if (!trimmed) badRequest("name cannot be empty");
  return prisma.folder.update({ where: { id }, data: { name: trimmed } });
}

/** Move a folder under a new parent (or to top-level with parentFolderId=null). Guards cycles/depth. */
export async function moveFolder(
  workspaceId: string,
  id: string,
  parentFolderId: string | null,
): Promise<Folder> {
  await requireFolder(workspaceId, id);
  if (parentFolderId) {
    if (parentFolderId === id) badRequest("a folder cannot be its own parent");
    await requireFolder(workspaceId, parentFolderId);
    // Reject moving a folder under one of its own descendants (cycle).
    let cursor: string | null = parentFolderId;
    while (cursor) {
      if (cursor === id) badRequest("cannot move a folder into its own subtree");
      const p: { parentFolderId: string | null } | null = await prisma.folder.findFirst({
        where: { id: cursor, workspaceId },
        select: { parentFolderId: true },
      });
      cursor = p?.parentFolderId ?? null;
    }
    if ((await depthOf(workspaceId, parentFolderId)) >= MAX_DEPTH) {
      badRequest(`folders may not nest deeper than ${MAX_DEPTH}`);
    }
  }
  return prisma.folder.update({ where: { id }, data: { parentFolderId } });
}

/** Delete a folder (its subtree + item placements cascade). */
export async function deleteFolder(workspaceId: string, id: string): Promise<boolean> {
  await requireFolder(workspaceId, id);
  await prisma.folder.delete({ where: { id } });
  return true;
}

export function listFolders(workspaceId: string): Promise<Folder[]> {
  return prisma.folder.findMany({
    where: { workspaceId },
    orderBy: [{ parentFolderId: "asc" }, { order: "asc" }],
  });
}

/** Place an item into a folder (idempotent per item). */
export async function addFolderItem(
  workspaceId: string,
  folderId: string,
  itemType: string,
  itemId: string,
): Promise<FolderItem> {
  if (!ITEM_TYPES.has(itemType)) badRequest(`Unknown item type '${itemType}'`);
  await requireFolder(workspaceId, folderId);
  return prisma.folderItem.upsert({
    where: { folderId_itemType_itemId: { folderId, itemType, itemId } },
    create: { folderId, itemType, itemId },
    update: {},
  });
}

export async function removeFolderItem(
  workspaceId: string,
  folderId: string,
  itemType: string,
  itemId: string,
): Promise<boolean> {
  await requireFolder(workspaceId, folderId);
  const res = await prisma.folderItem.deleteMany({ where: { folderId, itemType, itemId } });
  return res.count > 0;
}

export async function listFolderItems(
  workspaceId: string,
  folderId: string,
): Promise<FolderItem[]> {
  await requireFolder(workspaceId, folderId);
  return prisma.folderItem.findMany({ where: { folderId }, orderBy: { addedAt: "desc" } });
}
