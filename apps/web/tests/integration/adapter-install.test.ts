import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";

/**
 * Epic #2 Adapter Manager — installAdapter / removeAdapter (record-level install of an external
 * adapter). Admin + multi_provider_adapters gated; the builtIn adapter can never be removed. Exercises
 * the real GraphQL route. (The runtime hot-load — reload/reinstall — is separate, deferred infra.)
 */
const SECRET = "adapter-install-secret";
const WS = "ws_adapter_install";
const TEST_TYPE = "test-install-adapter";

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
    : { errors: [] };
}
async function cookieFor(role: "admin" | "member") {
  const token = await createJWT({ userId: "h_" + role, workspaceId: WS, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}

describe("adapter install/remove (Epic #2)", () => {
  beforeAll(async () => {
    process.env.SYSTEM_SECRET = SECRET;
    await prisma.agentAdapter.deleteMany({ where: { type: TEST_TYPE } });
    setTestFeature("multi_provider_adapters", true);
    invalidateFlagCache();
  });
  afterAll(async () => {
    await prisma.agentAdapter.deleteMany({ where: { type: TEST_TYPE } });
    resetTestFeature("multi_provider_adapters");
    invalidateFlagCache();
  });

  const INSTALL = `mutation($t:String!,$d:String!){ installAdapter(type:$t, displayName:$d, transport:"cloud", authKind:"apiKey"){ type } }`;
  const REMOVE = `mutation($t:String!){ removeAdapter(adapterType:$t) }`;

  it("admin installs a disabled external adapter, then removes it", async () => {
    const admin = await cookieFor("admin");
    const created = await gql(INSTALL, { t: TEST_TYPE, d: "Test Install" }, admin);
    expect(created.errors).toBeFalsy();
    const row = await prisma.agentAdapter.findUnique({ where: { type: TEST_TYPE } });
    expect(row).toMatchObject({ type: TEST_TYPE, builtIn: false, enabled: false });

    const removed = await gql(REMOVE, { t: TEST_TYPE }, admin);
    expect(removed.data.removeAdapter).toBe(true);
    expect(await prisma.agentAdapter.findUnique({ where: { type: TEST_TYPE } })).toBeNull();
  });

  it("rejects a duplicate type and a non-admin caller", async () => {
    const admin = await cookieFor("admin");
    await gql(INSTALL, { t: TEST_TYPE, d: "Test Install" }, admin);
    const dup = await gql(INSTALL, { t: TEST_TYPE, d: "Dup" }, admin);
    expect(dup.errors).toBeDefined();

    const member = await cookieFor("member");
    const denied = await gql(INSTALL, { t: "test-x", d: "X" }, member);
    expect(denied.errors).toBeDefined();
    expect(await prisma.agentAdapter.findUnique({ where: { type: "test-x" } })).toBeNull();
  });

  it("refuses to remove the built-in adapter", async () => {
    const admin = await cookieFor("admin");
    const res = await gql(REMOVE, { t: "openclaw-gateway" }, admin);
    expect(res.errors).toBeDefined();
    expect(
      await prisma.agentAdapter.findUnique({ where: { type: "openclaw-gateway" } }),
    ).not.toBeNull();
  });
});
