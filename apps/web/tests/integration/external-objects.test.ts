import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  upsertExternalObject,
  listExternalObjects,
  refreshExternalObject,
  deleteExternalObject,
  providerFor,
} from "../../src/server/services/external-objects";
import type { GithubFetcher } from "../../src/server/services/github-fetch";

// Parity #59 (external objects) / #65 (provider). The GitHub network call is stubbed via an injected
// fetcher so this runs offline; github-fetch itself (SSRF-guarded) is exercised against the live API
// elsewhere.
const WS = "ws_extobj";

const stubFetcher =
  (payload: Record<string, unknown>): GithubFetcher =>
  async () => ({ ok: true, status: 200, payload });

beforeEach(async () => {
  await prisma.externalObject.deleteMany({ where: { workspaceId: WS } });
});

describe("external object providers (#65)", () => {
  it("the github provider recognizes github refs and rejects others", () => {
    expect(providerFor("acme/app#1")?.key).toBe("github");
    expect(providerFor("https://github.com/acme/app")?.key).toBe("github");
    expect(providerFor("random string")).toBeNull();
  });
});

describe("external objects (#59)", () => {
  it("resolves + caches an object, linked to an internal entity", async () => {
    const obj = await upsertExternalObject({
      workspaceId: WS,
      reference: "acme/app#42",
      linkedType: "task",
      linkedId: "task-1",
      fetcher: stubFetcher({
        title: "Login bug",
        state: "open",
        html_url: "https://github.com/acme/app/issues/42",
      }),
    });
    expect(obj).toMatchObject({
      provider: "github",
      objectType: "issue",
      externalId: "acme/app#42",
      title: "Login bug",
      state: "open",
      linkedType: "task",
    });
    expect(await listExternalObjects(WS, { linkedType: "task", linkedId: "task-1" })).toHaveLength(
      1,
    );
  });

  it("upsert is idempotent per (provider, externalId) and refresh re-fetches", async () => {
    await upsertExternalObject({
      workspaceId: WS,
      reference: "acme/app#42",
      fetcher: stubFetcher({ title: "old", state: "open" }),
    });
    const again = await upsertExternalObject({
      workspaceId: WS,
      reference: "acme/app#42",
      fetcher: stubFetcher({ title: "new", state: "closed" }),
    });
    expect(again.title).toBe("new");
    expect(await prisma.externalObject.count({ where: { workspaceId: WS } })).toBe(1);

    const refreshed = await refreshExternalObject(
      WS,
      again.id,
      stubFetcher({ title: "newest", state: "closed" }),
    );
    expect(refreshed.title).toBe("newest");
    expect(await deleteExternalObject(WS, again.id)).toBe(true);
  });

  it("rejects an unrecognized reference", async () => {
    await expect(upsertExternalObject({ workspaceId: WS, reference: "not a ref" })).rejects.toThrow(
      /no provider/,
    );
  });

  it("surfaces a provider fetch failure", async () => {
    const failing: GithubFetcher = async () => ({
      ok: false,
      status: 404,
      payload: null,
      error: "GitHub returned 404",
    });
    await expect(
      upsertExternalObject({ workspaceId: WS, reference: "acme/app#999", fetcher: failing }),
    ).rejects.toThrow(/404/);
  });
});
