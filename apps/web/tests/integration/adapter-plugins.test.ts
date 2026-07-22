import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  upsertAdapterPlugin,
  listAdapterPlugins,
  deleteAdapterPlugin,
  loadWorkspaceAdapterPlugins,
} from "../../src/server/services/adapter-plugins";
import { getAdapter } from "@agentcenter/utils";

// Parity #5 — DB-backed adapter-plugin store.
const WS = "ws_adapterplugins";

beforeEach(async () => {
  await prisma.adapterPlugin.deleteMany({ where: { workspaceId: WS } });
});

describe("adapter-plugin store (#5)", () => {
  it("validates the spec at write time", async () => {
    await expect(
      upsertAdapterPlugin({ workspaceId: WS, key: "bad", base: "bogus", template: "x" }),
    ).rejects.toThrow(/base/);
    await expect(
      upsertAdapterPlugin({ workspaceId: WS, key: "empty", base: "process", template: [] }),
    ).rejects.toThrow(/template/);
  });

  it("persists, lists, and deletes", async () => {
    await upsertAdapterPlugin({
      workspaceId: WS,
      key: "aider",
      base: "process",
      template: ["aider", "--message", "{prompt}"],
    });
    expect(await listAdapterPlugins(WS)).toHaveLength(1);
    // update in place
    await upsertAdapterPlugin({
      workspaceId: WS,
      key: "aider",
      base: "process",
      template: ["aider", "-m", "{prompt}"],
      displayName: "Aider",
    });
    expect(await listAdapterPlugins(WS)).toHaveLength(1);
    expect((await listAdapterPlugins(WS))[0].displayName).toBe("Aider");
    expect(await deleteAdapterPlugin(WS, "aider")).toBe(true);
  });

  it("loads enabled plugins into the in-process adapter registry", async () => {
    await upsertAdapterPlugin({
      workspaceId: WS,
      key: "acme-cli",
      base: "process",
      template: ["acme", "{prompt}"],
    });
    await upsertAdapterPlugin({
      workspaceId: WS,
      key: "disabled-cli",
      base: "process",
      template: ["x"],
      enabled: false,
    });
    const keys = await loadWorkspaceAdapterPlugins(WS);
    expect(keys).toContain("acme-cli");
    expect(keys).not.toContain("disabled-cli");
    expect(getAdapter("acme-cli")?.key).toBe("acme-cli");
  });
});
