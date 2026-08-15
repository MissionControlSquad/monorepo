import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import { POST as _BRIDGE_MEMORY } from "../../app/api/runner/bridge/memory/route";
// memory route is now wrapped by withFeature (2-arg); it is static, so supply a dummy ctx.
const BRIDGE_MEMORY = (req: Request) => _BRIDGE_MEMORY(req, undefined as never);
import { attachRunBridgeToken } from "../../src/server/services/run-bridge";
import {
  resolveMemoryAdapter,
  dbMemoryAdapter,
  registerMemoryAdapter,
  type MemoryAdapter,
} from "../../src/server/services/memory-adapter";

// Tier D: MemoryAdapter registry + in-run agent memory tools (memory.note / .search / .forget), routed
// through the run-scoped bridge token so an agent can only ever touch its OWN memory.
const WS = "ws_mem_tools";

async function enableFlag(key: string, on = true) {
  await prisma.featureFlag.upsert({
    where: { key },
    create: { key, enabled: on, managedBy: "user" },
    update: { enabled: on },
  });
  invalidateFlagCache();
}

async function makeAgentWithDbMemory(suffix: string) {
  return prisma.agent.create({
    data: {
      name: `A_${suffix}`,
      role: "worker",
      personality: "x",
      workspaceId: WS,
      setupStatus: "active",
      memoryProvider: "db",
      apiKeyHash: hashApiKey(`mc_mt_${suffix}_${Math.random()}`),
    },
  });
}

async function makeRunningRun(agentId: string) {
  const task = await prisma.task.create({
    data: { title: "t", description: "d", status: "assigned", priority: "high", tags: [] },
  });
  const run = await prisma.agentRun.create({
    data: { workspaceId: WS, agentId, taskId: task.id, kind: "sandbox", status: "running" },
  });
  const token = await attachRunBridgeToken(run.id);
  return { task, run, token };
}

function memoryReq(token: string, body: unknown) {
  return new Request("http://test/api/runner/bridge/memory", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = "mem-tools-secret";
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE agent_runs, memory_operations, agent_memories, tasks, agents, profiles CASCADE`,
  );
  await enableFlag("runners", true);
  await enableFlag("memory", true);
});

describe("MemoryAdapter registry", () => {
  it("resolves the default db adapter (existing behavior preserved)", () => {
    const adapter = resolveMemoryAdapter("db");
    expect(adapter).toBe(dbMemoryAdapter);
    expect(adapter?.provider).toBe("db");
  });

  it("returns null for providers with no control-plane storage", () => {
    expect(resolveMemoryAdapter("none")).toBeNull();
    expect(resolveMemoryAdapter("markdown")).toBeNull();
  });

  it("db adapter append/search/forget/get are workspace+agent scoped", async () => {
    const agent = await makeAgentWithDbMemory("scoped");
    const scope = { workspaceId: WS, agentId: agent.id };
    const entry = await dbMemoryAdapter.append(scope, "adapter scoped note", { runId: null });
    expect(await dbMemoryAdapter.get(scope, entry.id)).toMatchObject({ id: entry.id });
    // Another agent cannot get it.
    const other = await makeAgentWithDbMemory("other");
    expect(await dbMemoryAdapter.get({ workspaceId: WS, agentId: other.id }, entry.id)).toBeNull();
    const found = await dbMemoryAdapter.search(scope, "scoped");
    expect(found.some((r) => r.id === entry.id)).toBe(true);
    expect(await dbMemoryAdapter.forget(scope, entry.id)).toBe(true);
    expect(await dbMemoryAdapter.get(scope, entry.id)).toBeNull();
  });

  it("supports registering a new provider without touching call-sites", () => {
    const stub: MemoryAdapter = {
      provider: "markdown",
      append: async () => ({}) as never,
      search: async () => [],
      forget: async () => false,
      get: async () => null,
    };
    try {
      registerMemoryAdapter(stub);
      expect(resolveMemoryAdapter("markdown")).toBe(stub);
    } finally {
      // Restore: markdown has no control-plane adapter by default.
      registerMemoryAdapter(dbMemoryAdapter); // db is unchanged; markdown stays registered for the process
    }
    // (registry is process-global; this test only asserts the registration mechanism works)
  });
});

describe("POST /api/runner/bridge/memory — in-run agent tools", () => {
  it("memory.note appends with run/agent provenance", async () => {
    const agent = await makeAgentWithDbMemory("note");
    const { run, task, token } = await makeRunningRun(agent.id);

    const res = await BRIDGE_MEMORY(
      memoryReq(token, { op: "note", content: "remember the api base" }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };

    const row = await prisma.agentMemory.findUnique({ where: { id: body.id } });
    expect(row).toMatchObject({
      workspaceId: WS,
      agentId: agent.id,
      content: "remember the api base",
      sourceKind: "run",
      sourceTaskId: task.id,
      sourceRefId: run.id,
    });
    // Provenance op recorded and cost attributed to the run (not double-billed).
    const op = await prisma.memoryOperation.findFirst({
      where: { agentId: agent.id, opType: "capture" },
    });
    expect(op).toMatchObject({ runId: run.id, attributionMode: "included_in_run" });
  });

  it("memory.search returns the noted entry", async () => {
    const agent = await makeAgentWithDbMemory("search");
    const { token } = await makeRunningRun(agent.id);
    await BRIDGE_MEMORY(memoryReq(token, { op: "note", content: "deploy runs on friday" }));

    const res = await BRIDGE_MEMORY(memoryReq(token, { op: "search", query: "friday" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<{ content: string }> };
    expect(body.results.some((r) => r.content === "deploy runs on friday")).toBe(true);
  });

  it("memory.forget removes the noted entry", async () => {
    const agent = await makeAgentWithDbMemory("forget");
    const { token } = await makeRunningRun(agent.id);
    const noted = await BRIDGE_MEMORY(memoryReq(token, { op: "note", content: "forget me" }));
    const created = (await noted.json()) as { id: string };

    const res = await BRIDGE_MEMORY(memoryReq(token, { op: "forget", memoryId: created.id }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { forgotten: boolean };
    expect(body.forgotten).toBe(true);
    expect(await prisma.agentMemory.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it("an agent cannot touch another agent's memory (scoping)", async () => {
    // Agent A notes an entry via its own run token.
    const agentA = await makeAgentWithDbMemory("A");
    const { token: tokenA } = await makeRunningRun(agentA.id);
    const notedA = await BRIDGE_MEMORY(
      memoryReq(tokenA, { op: "note", content: "A private secret" }),
    );
    const entryA = (await notedA.json()) as { id: string };

    // Agent B, with its own run token, cannot see or delete A's entry.
    const agentB = await makeAgentWithDbMemory("B");
    const { token: tokenB } = await makeRunningRun(agentB.id);

    const searchB = await BRIDGE_MEMORY(memoryReq(tokenB, { op: "search", query: "secret" }));
    const sB = (await searchB.json()) as { results: Array<{ id: string }> };
    expect(sB.results.some((r) => r.id === entryA.id)).toBe(false);

    const forgetB = await BRIDGE_MEMORY(memoryReq(tokenB, { op: "forget", memoryId: entryA.id }));
    const fB = (await forgetB.json()) as { forgotten: boolean };
    expect(fB.forgotten).toBe(false);
    // A's entry is untouched.
    expect(await prisma.agentMemory.findUnique({ where: { id: entryA.id } })).not.toBeNull();
  });

  it("rejects an invalid token (401) and a finished run's token (401)", async () => {
    const agent = await makeAgentWithDbMemory("tok");
    const { run, token } = await makeRunningRun(agent.id);
    expect((await BRIDGE_MEMORY(memoryReq("rbt_nope", { op: "note", content: "x" }))).status).toBe(
      401,
    );
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "done" } });
    expect((await BRIDGE_MEMORY(memoryReq(token, { op: "note", content: "late" }))).status).toBe(
      401,
    );
  });

  it("gates on the MEMORY flag (403 when disabled)", async () => {
    const agent = await makeAgentWithDbMemory("flag");
    const { token } = await makeRunningRun(agent.id);
    await enableFlag("memory", false);
    const res = await BRIDGE_MEMORY(memoryReq(token, { op: "note", content: "x" }));
    expect(res.status).toBe(403);
  });
});
