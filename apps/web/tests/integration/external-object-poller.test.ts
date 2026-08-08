import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  upsertExternalObject,
  refreshDueExternalObjects,
} from "../../src/server/services/external-objects";
import type { GithubFetcher } from "../../src/server/services/github-fetch";

// External-object background poller. Asserts (via the service directly) that a snapshot older than the
// staleness window is re-fetched while a fresh one is skipped, reusing the on-demand refresh/fetch path
// (the GitHub network call is stubbed so this runs offline).
const WS = "ws_extpoll";

const stubFetcher =
  (payload: Record<string, unknown>): GithubFetcher =>
  async () => ({ ok: true, status: 200, payload });

beforeEach(async () => {
  await prisma.externalObject.deleteMany({ where: { workspaceId: WS } });
});

describe("external-object poller", () => {
  it("refreshes a stale object and skips a fresh one", async () => {
    // Seed two cached objects.
    const stale = await upsertExternalObject({
      workspaceId: WS,
      reference: "acme/app#1",
      fetcher: stubFetcher({ title: "stale-old", state: "open" }),
    });
    const fresh = await upsertExternalObject({
      workspaceId: WS,
      reference: "acme/app#2",
      fetcher: stubFetcher({ title: "fresh-current", state: "open" }),
    });

    // Age the first one past the staleness window; leave the second freshly fetched.
    const now = new Date();
    const stalenessMs = 60 * 60 * 1000; // 1h
    await prisma.externalObject.update({
      where: { id: stale.id },
      data: { fetchedAt: new Date(now.getTime() - stalenessMs - 60_000) },
    });
    await prisma.externalObject.update({
      where: { id: fresh.id },
      data: { fetchedAt: new Date(now.getTime() - 60_000) },
    });

    const res = await refreshDueExternalObjects({
      now,
      stalenessMs,
      fetcher: stubFetcher({ title: "stale-refreshed", state: "closed" }),
    });
    expect(res).toMatchObject({ due: 1, refreshed: 1, failed: 0 });

    // The stale object was re-fetched (new snapshot + fetchedAt bumped to now).
    const staleAfter = await prisma.externalObject.findUnique({ where: { id: stale.id } });
    expect(staleAfter?.title).toBe("stale-refreshed");
    expect(staleAfter?.state).toBe("closed");
    expect(staleAfter!.fetchedAt.getTime()).toBeGreaterThanOrEqual(now.getTime());

    // The fresh object was untouched.
    const freshAfter = await prisma.externalObject.findUnique({ where: { id: fresh.id } });
    expect(freshAfter?.title).toBe("fresh-current");
  });

  it("counts a provider failure without aborting the batch", async () => {
    const obj = await upsertExternalObject({
      workspaceId: WS,
      reference: "acme/app#3",
      fetcher: stubFetcher({ title: "will-fail", state: "open" }),
    });
    await prisma.externalObject.update({
      where: { id: obj.id },
      data: { fetchedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    const failing: GithubFetcher = async () => ({
      ok: false,
      status: 500,
      payload: null,
      error: "upstream 500",
    });
    const res = await refreshDueExternalObjects({ stalenessMs: 60 * 60 * 1000, fetcher: failing });
    expect(res).toMatchObject({ due: 1, refreshed: 0, failed: 1 });
  });
});
