import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { FLAG_KEYS } from "@agentcenter/utils";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";
import { createTestAgent } from "../helpers";

/**
 * Epic #2 adapters — real GraphQL route (schema + resolvers + Postgres), human auth via a signed
 * bb-workspace-token cookie (Epic #1). Adapter rows are the migration-seeded 11 (openclaw-gateway
 * builtIn). Feature default is OFF → only openclaw-gateway is selectable until enabled.
 */
const SECRET = "adapter-test-secret";
const WS_A = "ws_adapter_A";
const WS_B = "ws_adapter_B";

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
  const token = await createJWT({ userId: "human_" + role, workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}

async function makeAgentInWs(ws: string) {
  const { agent } = await createTestAgent({ name: "AdapterAgent" });
  await prisma.agent.update({ where: { id: agent.id }, data: { workspaceId: ws } });
  return agent.id;
}

async function setFeature(enabled: boolean) {
  setTestFeature(FLAG_KEYS.MULTI_PROVIDER_ADAPTERS, enabled);
  invalidateFlagCache();
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE agents CASCADE`);
});

afterEach(async () => {
  resetTestFeature(FLAG_KEYS.MULTI_PROVIDER_ADAPTERS);
  invalidateFlagCache();
  // agent_adapters is global seed data (not truncated between files), so restore any adapter this
  // file toggled back to enabled so the disabled state can't bleed into other test files.
  await prisma.agentAdapter.updateMany({
    where: { type: { in: ["claude-local"] } },
    data: { enabled: true },
  });
});

describe("adapter registry listing (Epic #2)", () => {
  it("feature OFF → only builtIn openclaw-gateway is listed", async () => {
    await setFeature(false);
    const r = await gql(
      `query{ agentAdapters{ type builtIn } }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    expect(r.errors).toBeFalsy();
    expect(r.data.agentAdapters).toHaveLength(1);
    expect(r.data.agentAdapters[0]).toMatchObject({ type: "openclaw-gateway", builtIn: true });
  });

  it("feature ON → all seeded adapters are listed", async () => {
    await setFeature(true);
    const r = await gql(
      `query{ agentAdapters{ type } }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    expect(r.data.agentAdapters.length).toBeGreaterThanOrEqual(11);
    expect(r.data.agentAdapters.map((a: any) => a.type)).toContain("claude-local");
  });

  it("unauthenticated is denied", async () => {
    await setFeature(false);
    const r = await gql(`query{ agentAdapters{ type } }`);
    expect(r.errors).toBeDefined();
    expect(r.data?.agentAdapters).toBeFalsy();
  });
});

describe("setAgentAdapter (Epic #2)", () => {
  const SET = `mutation($a:String!,$t:String!,$c:JSON){ setAgentAdapter(agentId:$a, adapterType:$t, adapterConfig:$c){ id adapterType adapter{ type displayName } } }`;

  it("admin assigns the builtIn adapter with a valid config even when the feature is off", async () => {
    const id = await makeAgentInWs(WS_A);
    const r = await gql(
      SET,
      { a: id, t: "openclaw-gateway", c: { agentCenterUrl: "wss://x", token: "tok" } },
      await cookieFor(WS_A, "admin"),
    );
    expect(r.errors).toBeFalsy();
    expect(r.data.setAgentAdapter.adapterType).toBe("openclaw-gateway");
    expect(r.data.setAgentAdapter.adapter.type).toBe("openclaw-gateway");
  });

  it("rejects a config that violates the adapter's schema", async () => {
    const id = await makeAgentInWs(WS_A);
    const r = await gql(
      SET,
      { a: id, t: "openclaw-gateway", c: { agentCenterUrl: "wss://x" } }, // missing required token
      await cookieFor(WS_A, "admin"),
    );
    expect(r.errors).toBeDefined();
    const fresh = await prisma.agent.findUniqueOrThrow({ where: { id } });
    expect(fresh.adapterType).toBeNull(); // not written
  });

  it("rejects an unknown adapter type", async () => {
    const id = await makeAgentInWs(WS_A);
    const r = await gql(SET, { a: id, t: "does-not-exist", c: {} }, await cookieFor(WS_A, "admin"));
    expect(r.errors).toBeDefined();
  });

  it("blocks a non-builtIn adapter when the feature is off, allows it when on", async () => {
    const id = await makeAgentInWs(WS_A);
    await setFeature(false);
    const off = await gql(
      SET,
      { a: id, t: "claude-local", c: { model: "x" } },
      await cookieFor(WS_A, "admin"),
    );
    expect(off.errors).toBeDefined(); // FEATURE_DISABLED

    await setFeature(true);
    const on = await gql(
      SET,
      { a: id, t: "claude-local", c: { model: "x" } },
      await cookieFor(WS_A, "admin"),
    );
    expect(on.errors).toBeFalsy();
    expect(on.data.setAgentAdapter.adapterType).toBe("claude-local");
  });

  it("member cannot assign an adapter", async () => {
    const id = await makeAgentInWs(WS_A);
    const r = await gql(
      SET,
      { a: id, t: "openclaw-gateway", c: { agentCenterUrl: "wss://x", token: "t" } },
      await cookieFor(WS_A, "member"),
    );
    expect(r.errors).toBeDefined();
  });

  it("cannot assign to an agent in another workspace", async () => {
    const id = await makeAgentInWs(WS_B);
    const r = await gql(
      SET,
      { a: id, t: "openclaw-gateway", c: { agentCenterUrl: "wss://x", token: "t" } },
      await cookieFor(WS_A, "admin"),
    );
    expect(r.errors).toBeDefined();
  });
});

describe("setAdapterEnabled — Adapter Manager (Epic #2)", () => {
  const TOGGLE = `mutation($t:String!,$e:Boolean!){ setAdapterEnabled(adapterType:$t, enabled:$e){ type enabled } }`;

  it("admin disables then re-enables a non-builtIn adapter", async () => {
    const off = await gql(TOGGLE, { t: "claude-local", e: false }, await cookieFor(WS_A, "admin"));
    expect(off.errors).toBeFalsy();
    expect(off.data.setAdapterEnabled).toMatchObject({ type: "claude-local", enabled: false });
    const row = await prisma.agentAdapter.findUniqueOrThrow({ where: { type: "claude-local" } });
    expect(row.enabled).toBe(false);

    const on = await gql(TOGGLE, { t: "claude-local", e: true }, await cookieFor(WS_A, "admin"));
    expect(on.data.setAdapterEnabled.enabled).toBe(true);
  });

  it("a disabled adapter drops out of the enabledOnly listing", async () => {
    await setFeature(true);
    await gql(TOGGLE, { t: "claude-local", e: false }, await cookieFor(WS_A, "admin"));
    const r = await gql(
      `query{ agentAdapters(enabledOnly:true){ type } }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    expect(r.data.agentAdapters.map((a: any) => a.type)).not.toContain("claude-local");
  });

  it("refuses to disable the builtIn adapter", async () => {
    const r = await gql(
      TOGGLE,
      { t: "openclaw-gateway", e: false },
      await cookieFor(WS_A, "admin"),
    );
    expect(r.errors).toBeDefined();
    const row = await prisma.agentAdapter.findUniqueOrThrow({
      where: { type: "openclaw-gateway" },
    });
    expect(row.enabled).toBe(true);
  });

  it("rejects an unknown adapter and a non-admin", async () => {
    const unknown = await gql(TOGGLE, { t: "nope", e: false }, await cookieFor(WS_A, "admin"));
    expect(unknown.errors).toBeDefined();
    const member = await gql(
      TOGGLE,
      { t: "claude-local", e: false },
      await cookieFor(WS_A, "member"),
    );
    expect(member.errors).toBeDefined();
  });
});
