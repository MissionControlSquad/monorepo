import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { createJWT } from "../../src/lib/jwt";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import {
  addExternalLink,
  removeExternalLink,
  taskExternalLinks,
} from "../../src/server/services/external-links";

/** Tier C: external object links — service + GraphQL round-trip + feature gate. */
const SECRET = "external-links-secret";

async function gql(query: string, variables?: Record<string, unknown>) {
  const token = await createJWT(
    { userId: "human_x", workspaceId: "ws_x", userRole: "admin" },
    SECRET,
  );
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `bb-workspace-token=${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return JSON.parse(await (await GRAPHQL(req)).text()) as {
    data?: any;
    errors?: { message: string }[];
  };
}
async function makeTask(): Promise<string> {
  return (await prisma.task.create({ data: { title: "T", description: "T" } })).id;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE tasks, external_links, profiles CASCADE`);
});

describe("external links service (Tier C)", () => {
  it("adds a link, auto-classifies the kind, lists and removes it", async () => {
    const t = await makeTask();
    const link = await addExternalLink({
      taskId: t,
      url: "https://github.com/org/repo/issues/7",
      title: "Issue 7",
    });
    expect(link.kind).toBe("github");
    expect((await taskExternalLinks(t)).map((l) => l.id)).toContain(link.id);
    expect(await removeExternalLink(link.id)).toBe(true);
    expect(await taskExternalLinks(t)).toHaveLength(0);
  });

  it("rejects a non-http URL and a missing task", async () => {
    const t = await makeTask();
    await expect(addExternalLink({ taskId: t, url: "javascript:x" })).rejects.toThrow(/valid/);
    await expect(addExternalLink({ taskId: "nope", url: "https://example.com" })).rejects.toThrow(
      /task not found/,
    );
  });
});

describe("external links GraphQL (Tier C)", () => {
  it("round-trips + is feature-gated", async () => {
    const t = await makeTask();
    const add = await gql(
      `mutation($t:String!,$u:String!){ addExternalLink(taskId:$t, url:$u, title:"PR"){ id kind url } }`,
      { t, u: "https://gitlab.com/o/r/-/merge_requests/2" },
    );
    expect(add.errors).toBeFalsy();
    expect(add.data.addExternalLink.kind).toBe("gitlab");

    const list = await gql(`query($t:String!){ taskExternalLinks(taskId:$t){ id url } }`, { t });
    expect(list.data.taskExternalLinks).toHaveLength(1);

    try {
      await prisma.featureFlag.upsert({
        where: { key: "external_links" },
        create: { key: "external_links", enabled: false, managedBy: "user" },
        update: { enabled: false },
      });
      invalidateFlagCache();
      const gated = await gql(
        `mutation($t:String!,$u:String!){ addExternalLink(taskId:$t, url:$u){ id } }`,
        { t, u: "https://example.com" },
      );
      expect(gated.errors).toBeDefined();
    } finally {
      await prisma.featureFlag.deleteMany({ where: { key: "external_links" } });
      invalidateFlagCache();
    }
  });
});
