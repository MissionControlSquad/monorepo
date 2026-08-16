import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { createJWT } from "../../src/lib/jwt";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";

// Tier D: the control plane exposes the runtime adapter registry (RUNNERS-gated, member+).
const SECRET = "adapters-secret";
const WS = "ws_adapters";

async function gql(query: string, role: "admin" | "member" = "member") {
  const token = await createJWT({ userId: "h", workspaceId: WS, userRole: role }, SECRET);
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `bb-workspace-token=${token}` },
    body: JSON.stringify({ query }),
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
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE agents CASCADE`);
  resetTestFeature("runners");
  invalidateFlagCache();
});

describe("runtimeAdapters query (Tier D)", () => {
  it("returns the built-in adapters when RUNNERS is on", async () => {
    setTestFeature("runners", true);
    invalidateFlagCache();
    const res = await gql(
      `query{ runtimeAdapters{ key displayName requiresTemplate supportsModel models } }`,
    );
    expect(res.errors).toBeFalsy();
    const keys = res.data.runtimeAdapters.map((a: { key: string }) => a.key);
    expect(keys).toEqual(
      expect.arrayContaining(["openclaw", "codex", "claude", "gemini", "process", "shell"]),
    );
    const shell = res.data.runtimeAdapters.find((a: { key: string }) => a.key === "shell");
    expect(shell.requiresTemplate).toBe(true);
  });

  it("setAgentRuntime sets + validates an agent's runtime (admin)", async () => {
    setTestFeature("runners", true);
    invalidateFlagCache();
    const agent = await prisma.agent.create({
      data: { name: "RT", role: "worker", workspaceId: WS, setupStatus: "active" },
    });

    const set = await gql(
      `mutation{ setAgentRuntime(agentId:"${agent.id}", adapter:"claude", model:"claude-opus-4-8"){ runtimeAdapter runtimeModel } }`,
      "admin",
    );
    expect(set.data.setAgentRuntime).toMatchObject({
      runtimeAdapter: "claude",
      runtimeModel: "claude-opus-4-8",
    });

    const bad = await gql(
      `mutation{ setAgentRuntime(agentId:"${agent.id}", adapter:"nope"){ id } }`,
      "admin",
    );
    expect(bad.errors).toBeDefined();

    const denied = await gql(
      `mutation{ setAgentRuntime(agentId:"${agent.id}", adapter:"shell"){ id } }`,
      "member",
    );
    expect(denied.errors).toBeDefined();
  });

  it("is RUNNERS-gated", async () => {
    setTestFeature("runners", false);
    invalidateFlagCache();
    const res = await gql(`query{ runtimeAdapters{ key } }`);
    expect(res.errors).toBeDefined();
  });
});
