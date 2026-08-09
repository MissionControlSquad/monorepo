import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";

/**
 * Epic #12 (deferred seam, now wired): an `Authorization: Bearer mc_…` API key establishes tenancy.
 * A key authenticates as least-privilege `member`, scoped to the key's workspace; revoking the key or
 * disabling the API_KEYS flag immediately stops it.
 */
const SECRET = "keyauth-test-secret";
const WS_A = "ws_keyauth_A";
let humanId = "";

async function gql(
  query: string,
  variables?: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ query, variables }),
  });
  const res = await POST(req);
  const text = await res.text();
  return text
    ? (JSON.parse(text) as { data?: any; errors?: { message: string }[] })
    : { errors: [{ message: "empty" }] };
}
async function adminCookie(workspaceId: string) {
  const token = await createJWT({ userId: humanId, workspaceId, userRole: "admin" }, SECRET);
  return { Cookie: `bb-workspace-token=${token}` };
}
const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });

async function mintKey(workspaceId: string): Promise<{ id: string; plainKey: string }> {
  const r = await gql(
    `mutation($n:String!){ mintApiKey(name:$n){ id plainKey } }`,
    { n: "cli" },
    await adminCookie(workspaceId),
  );
  return r.data.mintApiKey;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE api_keys, goals, profiles CASCADE`);
  await prisma.featureFlag.deleteMany({ where: { key: "api_keys" } });
  invalidateFlagCache();
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "KeyAuth Human" } });
  humanId = p.id;
});

describe("API-key auth middleware (Epic #12)", () => {
  it("a Bearer key authenticates + is scoped to the key's workspace (no cookie)", async () => {
    const { plainKey } = await mintKey(WS_A);
    // Seed a goal in WS_A via the admin cookie…
    await gql(
      `mutation($t:String!){ createGoal(title:$t){ id } }`,
      { t: "Ship it" },
      await adminCookie(WS_A),
    );
    // …then read it back using ONLY the Bearer key.
    const r = await gql(`query{ goals{ id title } }`, undefined, bearer(plainKey));
    expect(r.errors).toBeFalsy();
    expect(r.data.goals).toHaveLength(1);
    expect(r.data.goals[0].title).toBe("Ship it");
  });

  it("authenticates as member — cannot perform an admin-only operation", async () => {
    const { plainKey } = await mintKey(WS_A);
    // apiKeys is an admin query; a member-level key must be refused.
    const r = await gql(`query{ apiKeys{ id } }`, undefined, bearer(plainKey));
    expect(r.errors).toBeDefined();
  });

  it("stops working once the key is revoked", async () => {
    const { id, plainKey } = await mintKey(WS_A);
    expect((await gql(`query{ goals{ id } }`, undefined, bearer(plainKey))).errors).toBeFalsy();
    await gql(`mutation($id:String!){ revokeApiKey(id:$id) }`, { id }, await adminCookie(WS_A));
    const after = await gql(`query{ goals{ id } }`, undefined, bearer(plainKey));
    expect(after.errors).toBeDefined();
  });

  it("is a kill-switch: disabling API_KEYS stops key auth", async () => {
    const { plainKey } = await mintKey(WS_A);
    try {
      await prisma.featureFlag.upsert({
        where: { key: "api_keys" },
        create: { key: "api_keys", enabled: false, managedBy: "user" },
        update: { enabled: false },
      });
      invalidateFlagCache();
      const r = await gql(`query{ goals{ id } }`, undefined, bearer(plainKey));
      expect(r.errors).toBeDefined();
    } finally {
      await prisma.featureFlag.deleteMany({ where: { key: "api_keys" } });
      invalidateFlagCache();
    }
  });

  it("ignores a malformed or unknown Bearer token", async () => {
    expect(
      (await gql(`query{ goals{ id } }`, undefined, bearer("mc_notreal"))).errors,
    ).toBeDefined();
    expect(
      (await gql(`query{ goals{ id } }`, undefined, { Authorization: "Bearer garbage" })).errors,
    ).toBeDefined();
  });
});
