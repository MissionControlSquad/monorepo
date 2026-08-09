import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  upsertCloudUpstream,
  listCloudUpstreams,
  planSync,
  recordSyncResult,
  deleteCloudUpstream,
} from "../../src/server/services/cloud-upstreams";

// Parity #24 — cloud upstream config + drift-state recording.
const WS = "ws_upstream";

beforeEach(async () => {
  await prisma.cloudUpstream.deleteMany({ where: { workspaceId: WS } });
});

describe("cloud upstreams (#24)", () => {
  it("upserts with URL validation and lists", async () => {
    await expect(
      upsertCloudUpstream({
        workspaceId: WS,
        projectId: "p",
        name: "origin",
        remoteUrl: "ftp://x",
      }),
    ).rejects.toThrow(/remoteUrl/);
    const up = await upsertCloudUpstream({
      workspaceId: WS,
      projectId: "p",
      name: "origin",
      remoteUrl: "https://github.com/acme/app.git",
    });
    expect(up.syncState).toBe("unknown");
    expect(await listCloudUpstreams(WS, "p")).toHaveLength(1);
  });

  it("records a comparison and recomputes the sync state", async () => {
    const up = await upsertCloudUpstream({
      workspaceId: WS,
      projectId: "p",
      name: "origin",
      remoteUrl: "https://github.com/acme/app.git",
    });
    // behind by 2
    const after = await recordSyncResult(WS, up.id, {
      localSha: "aaa",
      remoteSha: "bbb",
      ahead: 0,
      behind: 2,
    });
    expect(after.syncState).toBe("behind");
    expect(after.lastSyncedAt).not.toBeNull();
    expect((await planSync(WS, up.id)).action).toBe("pull");

    // an error result records lastError without clobbering state
    const errored = await recordSyncResult(WS, up.id, { error: "auth failed" });
    expect(errored.lastError).toBe("auth failed");

    expect(await deleteCloudUpstream(WS, up.id)).toBe(true);
  });
});
