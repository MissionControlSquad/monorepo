import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { createJWT } from "../../src/lib/jwt";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import { computeMetric, evaluateMonitors, createMonitor } from "../../src/server/services/monitors";

/** Tier C: workspace monitors — metric computation + on-demand evaluation + GraphQL + gate. */
const SECRET = "monitors-secret";
const WS = "ws_mon";

async function gql(
  query: string,
  variables?: Record<string, unknown>,
  role: "admin" | "member" = "admin",
) {
  const token = await createJWT({ userId: "human_x", workspaceId: WS, userRole: role }, SECRET);
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

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE monitors, agents, secrets CASCADE`);
});

describe("monitors service (Tier C)", () => {
  it("computeMetric counts live workspace data; evaluate flags a breach", async () => {
    await prisma.agent.create({
      data: { name: "A1", role: "w", workspaceId: WS, setupStatus: "active" },
    });
    await prisma.agent.create({
      data: { name: "A2", role: "w", workspaceId: WS, setupStatus: "active" },
    });
    await prisma.agent.create({
      data: { name: "P", role: "w", workspaceId: WS, setupStatus: "pending_setup" },
    });
    expect(await computeMetric(WS, "active_agents")).toBe(2);

    await createMonitor({
      workspaceId: WS,
      name: "Too many agents",
      metric: "active_agents",
      comparator: "gt",
      threshold: 1,
    });
    const evals = await evaluateMonitors(WS);
    expect(evals).toHaveLength(1);
    expect(evals[0]).toMatchObject({ value: 2, breached: true });
  });

  it("a paused monitor never reports breached", async () => {
    await prisma.agent.create({
      data: { name: "A", role: "w", workspaceId: WS, setupStatus: "active" },
    });
    const m = await createMonitor({
      workspaceId: WS,
      name: "m",
      metric: "active_agents",
      comparator: "gt",
      threshold: 0,
    });
    await prisma.monitor.update({ where: { id: m.id }, data: { isActive: false } });
    expect((await evaluateMonitors(WS))[0].breached).toBe(false);
  });
});

describe("monitors GraphQL (Tier C)", () => {
  it("admin CRUD + live monitors query; member cannot create; feature-gated", async () => {
    const created = await gql(
      `mutation{ createMonitor(name:"Disabled secrets", metric:"disabled_secrets", comparator:"gte", threshold:1){ id } }`,
    );
    expect(created.errors).toBeFalsy();

    // no disabled secrets yet → value 0, not breaching
    let list = await gql(`query{ monitors{ id value breached } }`);
    expect(list.data.monitors[0]).toMatchObject({ value: 0, breached: false });

    // add a disabled secret → now breaching
    await prisma.secret.create({ data: { workspaceId: WS, name: "S", status: "disabled" } });
    list = await gql(`query{ monitors{ value breached } }`);
    expect(list.data.monitors[0]).toMatchObject({ value: 1, breached: true });

    // member cannot create
    const denied = await gql(
      `mutation{ createMonitor(name:"x", metric:"active_agents", comparator:"gt", threshold:0){ id } }`,
      undefined,
      "member",
    );
    expect(denied.errors).toBeDefined();

    // invalid metric rejected
    const bad = await gql(
      `mutation{ createMonitor(name:"x", metric:"nope", comparator:"gt", threshold:0){ id } }`,
    );
    expect(bad.errors).toBeDefined();

    try {
      await prisma.featureFlag.upsert({
        where: { key: "monitors" },
        create: { key: "monitors", enabled: false, managedBy: "user" },
        update: { enabled: false },
      });
      invalidateFlagCache();
      const gated = await gql(`query{ monitors{ id } }`);
      expect(gated.errors).toBeDefined();
    } finally {
      await prisma.featureFlag.deleteMany({ where: { key: "monitors" } });
      invalidateFlagCache();
    }
  });
});
