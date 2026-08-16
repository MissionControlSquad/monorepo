import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";
import { requireAgentCapability } from "../../src/server/services/agent-authz";

/**
 * Epic #21 agent authorization — real GraphQL route + Postgres. Grant management (admin) + the
 * requireAgentCapability enforcement path (default-open, restricted-enforced, denial audited).
 */
const SECRET = "authz-test-secret";
const WS_A = "ws_authz_A";
const WS_B = "ws_authz_B";
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
async function makeAgent(ws: string, role = "worker") {
  const a = await prisma.agent.create({ data: { name: `${ws}-${role}`, role, workspaceId: ws } });
  return a.id;
}
async function restrict(agentId: string, workspaceId: string, allowlist: string[] = []) {
  await prisma.agentTrustProfile.create({
    data: { agentId, workspaceId, changeConsentRequired: true, executionAllowlist: allowlist },
  });
}
const GRANT = `mutation($a:String!,$c:String!,$p:String){ grantAgentCapability(agentId:$a, capability:$c, projectScope:$p){ id capability projectScope } }`;
const GRANTS = `query($a:String!){ agentCapabilityGrants(agentId:$a){ id capability } }`;

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE agent_capability_grants, agent_authz_events, agent_trust_profiles, agents, profiles CASCADE`,
  );
  resetTestFeature("agent_authz");
  invalidateFlagCache();
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "Authz Human" } });
  humanId = p.id;
});

describe("grant management (Epic #21)", () => {
  it("grants a capability (idempotent), lists it, then revokes it", async () => {
    const agentId = await makeAgent(WS_A);
    const admin = await cookieFor(WS_A, "admin");
    const g1 = await gql(GRANT, { a: agentId, c: "host.write" }, admin);
    expect(g1.data.grantAgentCapability.capability).toBe("host.write");
    // idempotent — same grant returns the same row
    await gql(GRANT, { a: agentId, c: "host.write" }, admin);
    expect(await prisma.agentCapabilityGrant.count({ where: { agentId } })).toBe(1);

    const list = await gql(GRANTS, { a: agentId }, admin);
    expect(list.data.agentCapabilityGrants).toHaveLength(1);

    const rm = await gql(
      `mutation($id:String!){ revokeAgentCapability(grantId:$id) }`,
      { id: g1.data.grantAgentCapability.id },
      admin,
    );
    expect(rm.data.revokeAgentCapability).toBe(true);
    expect(await prisma.agentCapabilityGrant.count()).toBe(0);
  });

  it("rejects an unknown capability and a member (non-admin)", async () => {
    const agentId = await makeAgent(WS_A);
    expect(
      (await gql(GRANT, { a: agentId, c: "root.access" }, await cookieFor(WS_A, "admin"))).errors,
    ).toBeDefined();
    expect(
      (await gql(GRANT, { a: agentId, c: "host.write" }, await cookieFor(WS_A, "member"))).errors,
    ).toBeDefined();
  });

  it("rejects a cross-workspace agent", async () => {
    const foreign = await makeAgent(WS_B);
    const denied = await gql(
      GRANT,
      { a: foreign, c: "host.write" },
      await cookieFor(WS_A, "admin"),
    );
    expect(denied.errors).toBeDefined();
  });
});

describe("enforcement — requireAgentCapability (Epic #21)", () => {
  it("open agent (no trust profile) is always allowed", async () => {
    const id = await makeAgent(WS_A);
    await expect(
      requireAgentCapability({ id, role: "worker" }, "host.write"),
    ).resolves.toBeUndefined();
    expect(await prisma.agentAuthzEvent.count()).toBe(0);
  });

  it("restricted agent without the grant is denied AND audited", async () => {
    const id = await makeAgent(WS_A);
    await restrict(id, WS_A);
    await expect(requireAgentCapability({ id, role: "worker" }, "host.write")).rejects.toThrow();
    const events = await prisma.agentAuthzEvent.findMany({ where: { agentId: id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ capability: "host.write", decision: "deny" });
  });

  it("restricted agent WITH the grant is allowed", async () => {
    const id = await makeAgent(WS_A);
    await restrict(id, WS_A);
    await gql(GRANT, { a: id, c: "host.write" }, await cookieFor(WS_A, "admin"));
    await expect(
      requireAgentCapability({ id, role: "worker" }, "host.write"),
    ).resolves.toBeUndefined();
  });

  it("a restricted agent may still use its role-default capabilities", async () => {
    const id = await makeAgent(WS_A);
    await restrict(id, WS_A);
    // docs.write is a base capability → allowed even when restricted
    await expect(
      requireAgentCapability({ id, role: "worker" }, "docs.write"),
    ).resolves.toBeUndefined();
  });

  it("respects the AGENT_AUTHZ kill-switch (disabled → no enforcement)", async () => {
    const id = await makeAgent(WS_A);
    await restrict(id, WS_A);
    try {
      setTestFeature("agent_authz", false);
      invalidateFlagCache();
      // even a restricted, ungranted capability is allowed when the feature is off
      await expect(
        requireAgentCapability({ id, role: "worker" }, "host.write"),
      ).resolves.toBeUndefined();
    } finally {
      resetTestFeature("agent_authz");
      invalidateFlagCache();
    }
  });
});

describe("gate (Epic #21)", () => {
  it("rejects grant reads when AGENT_AUTHZ is off", async () => {
    const agentId = await makeAgent(WS_A);
    try {
      setTestFeature("agent_authz", false);
      invalidateFlagCache();
      const r = await gql(GRANTS, { a: agentId }, await cookieFor(WS_A, "member"));
      expect(r.errors).toBeDefined();
    } finally {
      resetTestFeature("agent_authz");
      invalidateFlagCache();
    }
  });
});
