import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";
import { verifyApiKey } from "../../src/server/services/api-keys";
import { hashApiKey } from "../../src/server/api-key";

/**
 * Epic #12 API keys — real GraphQL route + Postgres. Keys are stored hashed; the plaintext is
 * returned exactly once at mint. admin-only, workspace-isolated.
 */
const SECRET = "apikey-test-secret";
const WS_A = "ws_key_A";
const WS_B = "ws_key_B";
let humanId = "";

async function gql(query: string, variables?: Record<string, unknown>, cookie?: string) {
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const res = await POST(req);
  const text = await res.text();
  return text
    ? (JSON.parse(text) as { data?: any; errors?: { message: string }[] })
    : { errors: [{ message: "empty" }] };
}
async function cookieFor(workspaceId: string, role: "admin" | "member") {
  const token = await createJWT({ userId: humanId, workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}
const MINT = `mutation($n:String!,$e:DateTime){ mintApiKey(name:$n, expiresAt:$e){ id name keyPrefix plainKey } }`;
const LIST = `query{ apiKeys{ id name keyPrefix revokedAt lastUsedAt } }`;

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE api_keys, profiles CASCADE`);
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "Key Human" } });
  humanId = p.id;
});

describe("mint + storage (Epic #12)", () => {
  it("returns a plaintext key whose hash matches the stored row (hash never returned)", async () => {
    const r = await gql(MINT, { n: "ci-token" }, await cookieFor(WS_A, "admin"));
    expect(r.errors).toBeFalsy();
    const { plainKey, keyPrefix, id } = r.data.mintApiKey;
    expect(plainKey.startsWith("mc_")).toBe(true);
    expect(keyPrefix).toBe(plainKey.slice(0, 12));
    const row = await prisma.apiKey.findUniqueOrThrow({ where: { id } });
    expect(row.keyHash).toBe(hashApiKey(plainKey));
    // The response shape has no keyHash.
    expect(JSON.stringify(r.data.mintApiKey)).not.toContain(row.keyHash);
  });

  it("never exposes the hash or plaintext through the list query", async () => {
    const mint = await gql(MINT, { n: "t" }, await cookieFor(WS_A, "admin"));
    const plainKey = mint.data.mintApiKey.plainKey;
    const row = await prisma.apiKey.findFirstOrThrow({ where: { workspaceId: WS_A } });
    const list = await gql(LIST, undefined, await cookieFor(WS_A, "admin"));
    const blob = JSON.stringify(list.data.apiKeys);
    expect(list.data.apiKeys).toHaveLength(1);
    expect(blob).not.toContain(row.keyHash);
    expect(blob).not.toContain(plainKey);
  });
});

describe("verify (Epic #12)", () => {
  it("resolves a fresh key, stamps lastUsedAt, and rejects revoked + expired keys", async () => {
    const admin = await cookieFor(WS_A, "admin");
    const good = (await gql(MINT, { n: "good" }, admin)).data.mintApiKey.plainKey;

    const v = await verifyApiKey(good);
    expect(v).toMatchObject({ workspaceId: WS_A });
    const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: v!.apiKeyId } });
    expect(row.lastUsedAt).not.toBeNull();

    // Revoked key → null.
    await gql(`mutation($id:String!){ revokeApiKey(id:$id) }`, { id: v!.apiKeyId }, admin);
    expect(await verifyApiKey(good)).toBeNull();

    // Expired key → null.
    const expired = (await gql(MINT, { n: "old", e: "2020-01-01T00:00:00.000Z" }, admin)).data
      .mintApiKey.plainKey;
    expect(await verifyApiKey(expired)).toBeNull();

    // Unknown key → null.
    expect(await verifyApiKey("mc_notarealkey")).toBeNull();
  });

  it("revoke is idempotent", async () => {
    const admin = await cookieFor(WS_A, "admin");
    const id = (await gql(MINT, { n: "r" }, admin)).data.mintApiKey.id;
    const r1 = await gql(`mutation($id:String!){ revokeApiKey(id:$id) }`, { id }, admin);
    const r2 = await gql(`mutation($id:String!){ revokeApiKey(id:$id) }`, { id }, admin);
    expect(r1.data.revokeApiKey).toBe(true);
    expect(r2.data.revokeApiKey).toBe(true);
    expect(await prisma.apiKey.count({ where: { id, revokedAt: { not: null } } })).toBe(1);
  });
});

describe("guards (Epic #12)", () => {
  it("is admin-only — a member cannot mint", async () => {
    const denied = await gql(MINT, { n: "x" }, await cookieFor(WS_A, "member"));
    expect(denied.errors).toBeDefined();
    expect(await prisma.apiKey.count()).toBe(0);
  });

  it("is workspace-isolated — WS_A cannot see WS_B's keys", async () => {
    await gql(MINT, { n: "b" }, await cookieFor(WS_B, "admin"));
    const list = await gql(LIST, undefined, await cookieFor(WS_A, "admin"));
    expect(list.data.apiKeys).toHaveLength(0);
  });

  it("rejects access when API_KEYS is off", async () => {
    try {
      setTestFeature("api_keys", false);
      invalidateFlagCache();
      const r = await gql(LIST, undefined, await cookieFor(WS_A, "admin"));
      expect(r.errors).toBeDefined();
    } finally {
      resetTestFeature("api_keys");
      invalidateFlagCache();
    }
  });
});
