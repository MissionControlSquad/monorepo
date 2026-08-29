import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { FLAG_KEYS } from "@agentcenter/utils";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";

/**
 * Plugin EXECUTION runtime — GraphQL surface (parity #103). grant/revoke/list capability, admin-only,
 * PLUGIN_RUNTIME-gated (off by default). Exercises the real GraphQL route + Postgres to prove the
 * resolver guards (feature flag + role) and least-privilege grant rules.
 *
 * HOW TO TEST: enable PLUGIN_RUNTIME, install a plugin, grantPluginCapability(pluginId, capability) as
 * admin → PluginGrant; revokePluginCapability → Boolean; pluginGrants(pluginId) → [PluginGrant].
 */
const SECRET = "plugin-runtime-secret";
const WS_A = "ws_pgrant_A";
const WS_B = "ws_pgrant_B";
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
async function setFlag(key: string, enabled: boolean) {
  setTestFeature(key, enabled);
  invalidateFlagCache();
}

const INSTALL = `mutation($m:JSON!){ installPlugin(manifest:$m){ pluginId capabilities } }`;
const GRANT = `mutation($p:String!,$c:String!){ grantPluginCapability(pluginId:$p, capability:$c){ capability } }`;
const REVOKE = `mutation($p:String!,$c:String!){ revokePluginCapability(pluginId:$p, capability:$c) }`;
const GRANTS = `query($p:String!){ pluginGrants(pluginId:$p){ capability } }`;

const manifest = {
  apiVersion: 1,
  id: "acme",
  version: "1.0.0",
  displayName: "Acme",
  category: "connector",
  capabilities: ["projects.read", "agent.tools.register"],
};

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE plugins, plugin_grants, profiles CASCADE`);
  resetTestFeature(FLAG_KEYS.PLUGIN_SDK);
  resetTestFeature(FLAG_KEYS.PLUGIN_RUNTIME);
  invalidateFlagCache();
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "Grant Human" } });
  humanId = p.id;
});

describe("plugin capability grants — GraphQL guards (#103)", () => {
  it("grant is PLUGIN_RUNTIME-gated and admin-only, fail-closed by default", async () => {
    await setFlag(FLAG_KEYS.PLUGIN_SDK, true);
    const admin = await cookieFor(WS_A, "admin");
    await gql(INSTALL, { m: manifest }, admin);

    // Flag off → feature disabled (the route masks the message; presence of an error is the signal).
    await setFlag(FLAG_KEYS.PLUGIN_RUNTIME, false);
    const off = await gql(GRANT, { p: "acme", c: "agent.tools.register" }, admin);
    expect(off.errors).toBeDefined();
    expect(off.data?.grantPluginCapability ?? null).toBeNull();

    await setFlag(FLAG_KEYS.PLUGIN_RUNTIME, true);

    // member role → forbidden.
    const member = await cookieFor(WS_A, "member");
    const denied = await gql(GRANT, { p: "acme", c: "agent.tools.register" }, member);
    expect(denied.errors).toBeDefined();

    // admin → granted.
    const ok = await gql(GRANT, { p: "acme", c: "agent.tools.register" }, admin);
    expect(ok.errors).toBeFalsy();
    expect(ok.data?.grantPluginCapability?.capability).toBe("agent.tools.register");

    // least privilege: cannot grant an undeclared capability.
    const bad = await gql(GRANT, { p: "acme", c: "issues.create" }, admin);
    expect(bad.errors).toBeDefined();
    // it was NOT persisted (still only the one declared grant).
    expect(
      await prisma.pluginGrant.count({ where: { workspaceId: WS_A, capability: "issues.create" } }),
    ).toBe(0);
  });

  it("list + revoke, and workspace isolation", async () => {
    await setFlag(FLAG_KEYS.PLUGIN_SDK, true);
    await setFlag(FLAG_KEYS.PLUGIN_RUNTIME, true);
    const adminA = await cookieFor(WS_A, "admin");
    const adminB = await cookieFor(WS_B, "admin");
    await gql(INSTALL, { m: manifest }, adminA);
    await gql(GRANT, { p: "acme", c: "agent.tools.register" }, adminA);

    const listed = await gql(GRANTS, { p: "acme" }, adminA);
    expect(listed.data?.pluginGrants).toHaveLength(1);

    // Workspace B sees none of A's grants.
    const listedB = await gql(GRANTS, { p: "acme" }, adminB);
    expect(listedB.data?.pluginGrants).toHaveLength(0);

    const revoked = await gql(REVOKE, { p: "acme", c: "agent.tools.register" }, adminA);
    expect(revoked.data?.revokePluginCapability).toBe(true);
    const after = await gql(GRANTS, { p: "acme" }, adminA);
    expect(after.data?.pluginGrants).toHaveLength(0);
  });
});
