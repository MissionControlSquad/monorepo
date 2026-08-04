import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  recordAsset,
  listAssets,
  listCompanyArtifacts,
  deleteAsset,
} from "../../src/server/services/assets";

// Parity #15 (assets) / #27 (company artifacts). Metadata layer only — R2 object I/O is exercised
// elsewhere (needs live creds); deleteAsset tolerates a storage failure and still removes the row.
const WS = "ws_assets";

beforeEach(async () => {
  await prisma.asset.deleteMany({ where: { workspaceId: WS } });
});

describe("assets (#15)", () => {
  it("records + lists with validation", async () => {
    await recordAsset({
      workspaceId: WS,
      name: "logo.png",
      kind: "image",
      mimeType: "image/png",
      sizeBytes: 1024,
      storageKey: "assets/uuid-logo.png",
    });
    expect(await listAssets(WS)).toHaveLength(1);
    expect(await listAssets(WS, { kind: "image" })).toHaveLength(1);
    expect(await listAssets(WS, { kind: "document" })).toHaveLength(0);

    await expect(
      recordAsset({ workspaceId: WS, name: "x", kind: "bogus", mimeType: "x", storageKey: "k" }),
    ).rejects.toThrow(/kind/);
    await expect(
      recordAsset({ workspaceId: WS, name: "x", kind: "image", mimeType: "x", storageKey: "" }),
    ).rejects.toThrow(/storageKey/);
  });

  it("requires ownerId when ownerType is set", async () => {
    await expect(
      recordAsset({
        workspaceId: WS,
        name: "x",
        kind: "image",
        mimeType: "x",
        storageKey: "k",
        ownerType: "company",
      }),
    ).rejects.toThrow(/ownerId/);
    await expect(
      recordAsset({
        workspaceId: WS,
        name: "x",
        kind: "image",
        mimeType: "x",
        storageKey: "k",
        ownerType: "bogus",
        ownerId: "c1",
      }),
    ).rejects.toThrow(/ownerType/);
  });
});

describe("company artifacts (#27)", () => {
  it("scopes artifacts to their owning company", async () => {
    await recordAsset({
      workspaceId: WS,
      name: "brief.pdf",
      kind: "document",
      mimeType: "application/pdf",
      storageKey: "assets/uuid-brief.pdf",
      ownerType: "company",
      ownerId: "co-1",
    });
    await recordAsset({
      workspaceId: WS,
      name: "other.pdf",
      kind: "document",
      mimeType: "application/pdf",
      storageKey: "assets/uuid-other.pdf",
      ownerType: "company",
      ownerId: "co-2",
    });
    expect(await listCompanyArtifacts(WS, "co-1")).toHaveLength(1);
    expect((await listCompanyArtifacts(WS, "co-1"))[0].name).toBe("brief.pdf");
  });
});

describe("deleteAsset", () => {
  it("removes the row even when storage deletion fails (no R2 creds in test)", async () => {
    const a = await recordAsset({
      workspaceId: WS,
      name: "x.bin",
      kind: "binary",
      mimeType: "application/octet-stream",
      storageKey: "assets/uuid-x.bin",
    });
    expect(await deleteAsset(WS, a.id)).toBe(true);
    expect(await prisma.asset.count({ where: { workspaceId: WS } })).toBe(0);
    expect(await deleteAsset(WS, a.id)).toBe(false); // already gone
  });
});
