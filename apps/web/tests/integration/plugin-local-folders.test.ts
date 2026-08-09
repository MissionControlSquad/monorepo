import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  registerLocalFolder,
  listLocalFolders,
  setLocalFolderEnabled,
  recordLocalFolderLoad,
  removeLocalFolder,
} from "../../src/server/services/plugin-local-folders";

// Parity #116 — dev-mode local plugin folder registry.
const WS = "ws_localfolders";

beforeEach(async () => {
  await prisma.pluginLocalFolder.deleteMany({ where: { workspaceId: WS } });
});

describe("plugin local folders (#116)", () => {
  it("registers (normalized path), lists, toggles, records load, removes", async () => {
    const f = await registerLocalFolder({
      workspaceId: WS,
      path: "/dev/./plugins/../plugins/acme",
      label: "Acme",
    });
    expect(f.path).toBe("/dev/plugins/acme"); // normalized
    expect(await listLocalFolders(WS)).toHaveLength(1);

    await setLocalFolderEnabled(WS, f.id, false);
    expect(await listLocalFolders(WS, true)).toHaveLength(0);

    await recordLocalFolderLoad(WS, f.id, "syntax error in manifest");
    expect((await prisma.pluginLocalFolder.findUnique({ where: { id: f.id } }))?.lastError).toMatch(
      /syntax error/,
    );

    expect(await removeLocalFolder(WS, f.id)).toBe(true);
  });

  it("upsert on the same normalized path doesn't duplicate", async () => {
    await registerLocalFolder({ workspaceId: WS, path: "/dev/plugins/x" });
    await registerLocalFolder({ workspaceId: WS, path: "/dev/plugins/x", label: "X" });
    expect(await listLocalFolders(WS)).toHaveLength(1);
  });
});
