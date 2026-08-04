import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";

// Proves the newly-wired GraphQL verticals reach their services through the REAL route (schema assembles,
// flag-gated, tenancy-scoped). Service logic itself is covered by each feature's own service test.
const SECRET = "api-wiring-secret";
const WS = "ws_apiwiring";
let humanId = "";

async function gql(query: string, variables?: Record<string, unknown>, role: "admin" | "member" = "admin") {
  const token = await createJWT({ userId: humanId, workspaceId: WS, userRole: role, email: "u@x.com" }, SECRET);
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `bb-workspace-token=${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return JSON.parse(await (await POST(req)).text()) as { data?: any; errors?: any };
}

async function enableFlags(keys: string[]) {
  for (const key of keys) {
    await prisma.featureFlag.upsert({ where: { key }, create: { key, enabled: true, managedBy: "user" }, update: { enabled: true } });
  }
  invalidateFlagCache();
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
  humanId = "human-apiwiring";
});

beforeEach(async () => {
  await prisma.asset.deleteMany({ where: { workspaceId: WS } });
  await prisma.skillComment.deleteMany({ where: { workspaceId: WS } });
  await enableFlags(["assets", "skills_teams", "inbox_policy"]);
});

describe("wired GraphQL verticals (end-to-end through the route)", () => {
  it("assets: recordAsset → assets query → deleteAsset", async () => {
    const rec = await gql(
      `mutation($k:String!){ recordAsset(name:"logo.png", kind:"image", mimeType:"image/png", storageKey:$k){ id name } }`,
      { k: "assets/uuid-logo.png" },
    );
    expect(rec.errors).toBeFalsy();
    const id = rec.data.recordAsset.id;

    const list = await gql(`query{ assets{ id name kind } }`, undefined, "member");
    expect(list.data.assets.map((a: any) => a.name)).toContain("logo.png");

    const del = await gql(`mutation($id:String!){ deleteAsset(id:$id) }`, { id });
    expect(del.data.deleteAsset).toBe(true);
  });

  it("skill comments: add → list", async () => {
    const add = await gql(`mutation{ addSkillComment(skillId:"s1", body:"nice skill"){ id body } }`, undefined, "member");
    expect(add.errors).toBeFalsy();
    const list = await gql(`query{ skillComments(skillId:"s1"){ id body } }`, undefined, "member");
    expect(list.data.skillComments[0].body).toBe("nice skill");
  });

  it("inbox policies: set → list (admin-gated)", async () => {
    const set = await gql(`mutation{ setInboxPolicy(itemKind:"task_review", action:"route_to_human", priority:5){ id action } }`);
    expect(set.errors).toBeFalsy();
    const list = await gql(`query{ inboxPolicies{ id itemKind action } }`, undefined, "member");
    expect(list.data.inboxPolicies[0].action).toBe("route_to_human");
  });

  it("a member cannot set an admin-gated inbox policy", async () => {
    const res = await gql(`mutation{ setInboxPolicy(itemKind:"mention", action:"ignore"){ id } }`, undefined, "member");
    // Denied (the admin gate fired). Message may be masked in some configs; the presence of an error +
    // null data is the meaningful signal.
    expect(res.errors).toBeTruthy();
    expect(res.data?.setInboxPolicy ?? null).toBeNull();
  });
});
