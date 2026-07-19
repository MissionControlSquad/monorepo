import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { agentCache } from "../../src/server/cache";
import { createJWT } from "../../src/lib/jwt";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import { POST as POST_MEMORY } from "../../app/api/agents/me/memory/route";
import { GET as GET_CONTEXT } from "../../app/api/agents/me/context/route";
import {
  appendAgentMemory,
  readAgentMemory,
  assembleInjectedMemory,
} from "../../src/server/services/agent-memory";

// Tier D: two-layer memory — control-plane binding + `db` provider storage/provenance + injection.
const SECRET = "mem-secret";
const WS = "ws_mem";
const KEY = "mc_mem_key";
let agentId = "";

async function makeAgent(): Promise<string> {
  const a = await prisma.agent.create({
    data: {
      name: "Mem",
      role: "worker",
      workspaceId: WS,
      setupStatus: "active",
      apiKeyHash: hashApiKey(KEY),
    },
  });
  return a.id;
}
async function enableMemory(on = true) {
  await prisma.featureFlag.upsert({
    where: { key: "memory" },
    create: { key: "memory", enabled: on, managedBy: "user" },
    update: { enabled: on },
  });
  invalidateFlagCache();
}
async function enableRunners() {
  await prisma.featureFlag.upsert({
    where: { key: "runners" },
    create: { key: "runners", enabled: true, managedBy: "user" },
    update: { enabled: true },
  });
  invalidateFlagCache();
}
function postMemory(body: unknown) {
  return POST_MEMORY(
    new Request("http://test/api/agents/me/memory", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
async function gql(query: string, role: "admin" | "member" = "admin") {
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
  agentCache.clear();
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE agent_memories, tasks, agents CASCADE`);
  await prisma.featureFlag.deleteMany({ where: { key: { in: ["memory", "runners"] } } });
  invalidateFlagCache();
  await enableMemory();
  await enableRunners();
  agentId = await makeAgent();
});

describe("agent memory (Tier D two-layer)", () => {
  it("appends with provenance + reads newest-first; assembleInjectedMemory concatenates oldest-first", async () => {
    await appendAgentMemory({ workspaceId: WS, agentId, content: "first", sourceTaskId: "t1" });
    await appendAgentMemory({ workspaceId: WS, agentId, content: "second", sourceTaskId: "t2" });
    const rows = await readAgentMemory(WS, agentId);
    expect(rows.map((r) => r.content)).toEqual(["second", "first"]);
    expect(rows[0].sourceTaskId).toBe("t2");
    expect(await assembleInjectedMemory(WS, agentId)).toBe("first\n\n---\n\nsecond");
  });

  it("POST /api/agents/me/memory stores an entry (agent-key, MEMORY-gated)", async () => {
    const res = await postMemory({ content: "learned X", taskId: "t9" });
    expect(res.status).toBe(200);
    const rows = await readAgentMemory(WS, agentId);
    expect(rows[0]).toMatchObject({ content: "learned X", sourceTaskId: "t9" });

    // gated
    await enableMemory(false);
    expect((await postMemory({ content: "y" })).status).toBe(403);
  });

  it("context bundle carries the memory binding: null for none, injected content for db", async () => {
    const task = await prisma.task.create({
      data: { title: "T", description: "d", status: "assigned" },
    });
    const ctx = () =>
      GET_CONTEXT(
        new Request(`http://test/api/agents/me/context?taskId=${task.id}`, {
          headers: { Authorization: `Bearer ${KEY}` },
        }),
      );
    // default provider "none" → memory null
    expect((await (await ctx()).json()).memory).toBeNull();

    // bind db + add memory → injected
    await prisma.agent.update({ where: { id: agentId }, data: { memoryProvider: "db" } });
    await appendAgentMemory({ workspaceId: WS, agentId, content: "prior note" });
    agentCache.clear();
    const body = await (await ctx()).json();
    expect(body.memory).toMatchObject({ provider: "db", content: "prior note" });
  });

  it("setAgentMemoryProvider binds/validates (admin, MEMORY-gated)", async () => {
    const ok = await gql(
      `mutation{ setAgentMemoryProvider(agentId:"${agentId}", provider:"markdown"){ memoryProvider } }`,
    );
    expect(ok.data.setAgentMemoryProvider.memoryProvider).toBe("markdown");

    const bad = await gql(
      `mutation{ setAgentMemoryProvider(agentId:"${agentId}", provider:"nope"){ id } }`,
    );
    expect(bad.errors).toBeDefined();
  });
});
