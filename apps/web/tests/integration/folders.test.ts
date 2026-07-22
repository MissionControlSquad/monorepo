import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
  listFolders,
  addFolderItem,
  removeFolderItem,
  listFolderItems,
} from "../../src/server/services/folders";

// Parity #64 — folders (nestable tree + generic item placement).
const WS = "ws_folders";

beforeEach(async () => {
  await prisma.folder.deleteMany({ where: { workspaceId: WS } });
});

describe("folders CRUD + nesting (#64)", () => {
  it("creates top-level + nested folders and lists them", async () => {
    const root = await createFolder({ workspaceId: WS, name: "Root" });
    const child = await createFolder({ workspaceId: WS, name: "Child", parentFolderId: root.id });
    expect(child.parentFolderId).toBe(root.id);
    expect(await listFolders(WS)).toHaveLength(2);
  });

  it("renames + moves + deletes (subtree cascades)", async () => {
    const a = await createFolder({ workspaceId: WS, name: "A" });
    const b = await createFolder({ workspaceId: WS, name: "B" });
    const child = await createFolder({ workspaceId: WS, name: "C", parentFolderId: a.id });

    const renamed = await renameFolder(WS, a.id, "A2");
    expect(renamed.name).toBe("A2");

    const moved = await moveFolder(WS, child.id, b.id);
    expect(moved.parentFolderId).toBe(b.id);

    // deleting b cascades its child
    expect(await deleteFolder(WS, b.id)).toBe(true);
    const remaining = await listFolders(WS);
    expect(remaining.map((f) => f.id).sort()).toEqual([a.id].sort());
  });

  it("rejects self-parenting and moving into own subtree (cycle guard)", async () => {
    const p = await createFolder({ workspaceId: WS, name: "P" });
    const c = await createFolder({ workspaceId: WS, name: "C", parentFolderId: p.id });
    await expect(moveFolder(WS, p.id, p.id)).rejects.toThrow(/own parent/);
    await expect(moveFolder(WS, p.id, c.id)).rejects.toThrow(/own subtree/);
  });

  it("scopes to the workspace — another workspace's folder is not found", async () => {
    const f = await createFolder({ workspaceId: WS, name: "F" });
    await expect(renameFolder("ws_other", f.id, "x")).rejects.toThrow(/not found/);
  });
});

describe("folder items (#64)", () => {
  it("adds items idempotently, lists, and removes", async () => {
    const f = await createFolder({ workspaceId: WS, name: "F" });
    await addFolderItem(WS, f.id, "task", "t1");
    await addFolderItem(WS, f.id, "task", "t1"); // idempotent
    await addFolderItem(WS, f.id, "project", "p1");
    expect(await listFolderItems(WS, f.id)).toHaveLength(2);

    expect(await removeFolderItem(WS, f.id, "task", "t1")).toBe(true);
    expect(await listFolderItems(WS, f.id)).toHaveLength(1);
  });

  it("rejects an unknown item type", async () => {
    const f = await createFolder({ workspaceId: WS, name: "F" });
    await expect(addFolderItem(WS, f.id, "bogus", "x")).rejects.toThrow(/item type/);
  });
});
