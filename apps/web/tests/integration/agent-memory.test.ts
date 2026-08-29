import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { agentCache } from "../../src/server/cache";
import { createJWT } from "../../src/lib/jwt";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import { POST as POST_MEMORY } from "../../app/api/agents/me/memory/route";
import { GET as GET_CONTEXT } from "../../app/api/agents/me/context/route";
import {
  appendAgentMemory,
  readAgentMemory,
  assembleInjectedMemory,
  recordMemoryOperation,
  captureRunMemory,
  getCompanyDefaultMemoryProvider,
  setCompanyDefaultMemoryProvider,
  resolveEffectiveMemoryProvider,
} from "../../src/server/services/agent-memory";
import { FLAG_KEYS, resolveMemoryProvider } from "@agentcenter/utils";

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
  setTestFeature(FLAG_KEYS.MEMORY, on);
  invalidateFlagCache();
}
async function enableRunners() {
  setTestFeature(FLAG_KEYS.RUNNERS, true);
  invalidateFlagCache();
}
function postMemory(body: unknown) {
  return POST_MEMORY(
    new Request("http://test/api/agents/me/memory", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
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
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE agent_memories, memory_operations, workspace_memory_settings, agent_runs, tasks, agents CASCADE`,
  );
  resetTestFeature(FLAG_KEYS.MEMORY);
  resetTestFeature(FLAG_KEYS.RUNNERS);
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
        { params: Promise.resolve({}) },
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

describe("memory operations audit + capture + resolution (Domain 4 GAP-A/-B/-C)", () => {
  it("GAP-C: resolveMemoryProvider precedence — agent override > company default > none", () => {
    expect(resolveMemoryProvider("db", "markdown")).toBe("db"); // override wins
    expect(resolveMemoryProvider(null, "markdown")).toBe("markdown"); // company default
    expect(resolveMemoryProvider(null, null)).toBe("none"); // nothing bound
    expect(resolveMemoryProvider("bogus", "db")).toBe("db"); // invalid override falls through
  });

  it("GAP-C: company default is get/set and drives effective resolution", async () => {
    expect(await getCompanyDefaultMemoryProvider(WS)).toBe("none");
    await setCompanyDefaultMemoryProvider(WS, "db", "profile_x");
    expect(await getCompanyDefaultMemoryProvider(WS)).toBe("db");
    // no agent override → company default applies
    expect(await resolveEffectiveMemoryProvider(WS, null)).toBe("db");
    // agent override beats company default
    expect(await resolveEffectiveMemoryProvider(WS, "markdown")).toBe("markdown");
  });

  it("GAP-A: recordMemoryOperation writes an audit row; assembleInjectedMemory logs a query op", async () => {
    await recordMemoryOperation({
      workspaceId: WS,
      agentId,
      provider: "db",
      opType: "forget",
      taskId: "t1",
      success: false,
      error: "boom",
    });
    await appendAgentMemory({ workspaceId: WS, agentId, content: "note", sourceTaskId: "t1" });
    await assembleInjectedMemory(WS, agentId, { taskId: "t1", runId: "r1" });

    const ops = await prisma.memoryOperation.findMany({
      where: { workspaceId: WS, agentId },
      orderBy: { createdAt: "asc" },
    });
    const forget = ops.find((o) => o.opType === "forget");
    const query = ops.find((o) => o.opType === "query");
    expect(forget).toMatchObject({ success: false, error: "boom", taskId: "t1" });
    expect(query).toMatchObject({
      resultCount: 1,
      runId: "r1",
      attributionMode: "included_in_run",
    });
    expect(query?.latencyMs).not.toBeNull();
  });

  it("GAP-B: captureRunMemory writes an entry + capture op for db; no-op for none/markdown", async () => {
    // none provider (no company default) → nothing captured
    expect(
      await captureRunMemory({
        workspaceId: WS,
        agentId,
        agentProvider: "none",
        taskId: "t1",
        runId: "r1",
        summary: "should not persist",
      }),
    ).toBeNull();

    // markdown → also no control-plane capture
    expect(
      await captureRunMemory({
        workspaceId: WS,
        agentId,
        agentProvider: "markdown",
        taskId: "t1",
        runId: "r1",
        summary: "runner holds this",
      }),
    ).toBeNull();

    // db → one entry + one capture op with run provenance
    const entry = await captureRunMemory({
      workspaceId: WS,
      agentId,
      agentProvider: "db",
      taskId: "t2",
      runId: "r2",
      summary: "Run done. built the thing.",
    });
    expect(entry).not.toBeNull();
    expect(entry).toMatchObject({ sourceTaskId: "t2", sourceKind: "run", sourceRefId: "r2" });

    const entries = await readAgentMemory(WS, agentId);
    expect(entries).toHaveLength(1);
    const captures = await prisma.memoryOperation.findMany({
      where: { workspaceId: WS, agentId, opType: "capture" },
    });
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({ runId: "r2", sourceKind: "run", resultCount: 1 });
  });

  it("GAP-B: captureRunMemory uses the company default when the agent has no override", async () => {
    await setCompanyDefaultMemoryProvider(WS, "db");
    const entry = await captureRunMemory({
      workspaceId: WS,
      agentId,
      agentProvider: null, // no override → falls to company default (db)
      taskId: "t3",
      runId: "r3",
      summary: "captured via company default",
    });
    expect(entry).not.toBeNull();
    expect(await readAgentMemory(WS, agentId)).toHaveLength(1);
  });

  it("GAP-C: setCompanyMemoryProvider + companyMemoryDefault + memoryOperations over GraphQL", async () => {
    const set = await gql(`mutation{ setCompanyMemoryProvider(provider:"db") }`);
    expect(set.data.setCompanyMemoryProvider).toBe("db");
    const read = await gql(`query{ companyMemoryDefault }`, "member");
    expect(read.data.companyMemoryDefault).toBe("db");

    // member cannot set (admin-only)
    const denied = await gql(`mutation{ setCompanyMemoryProvider(provider:"markdown") }`, "member");
    expect(denied.errors).toBeDefined();

    // audit query returns workspace-scoped rows
    await recordMemoryOperation({ workspaceId: WS, agentId, provider: "db", opType: "query" });
    const ops = await gql(
      `query{ memoryOperations(agentId:"${agentId}"){ opType provider } }`,
      "member",
    );
    expect(ops.data.memoryOperations.length).toBeGreaterThan(0);
    expect(ops.data.memoryOperations[0].opType).toBe("query");
  });
});

describe("memory search + forget (Domain 4 GAP-F)", () => {
  it("searchAgentMemory does an ILIKE recall + records a query op; forget deletes + records forget", async () => {
    const { searchAgentMemory, forgetAgentMemory } =
      await import("../../src/server/services/agent-memory");
    await appendAgentMemory({
      workspaceId: WS,
      agentId,
      content: "Deploy uses Vercel and Postgres",
    });
    await appendAgentMemory({ workspaceId: WS, agentId, content: "The user prefers dark mode" });

    // case-insensitive substring recall
    const hits = await searchAgentMemory(WS, agentId, "postgres");
    expect(hits).toHaveLength(1);
    expect(hits[0].content).toContain("Postgres");
    // empty query → all (newest first)
    expect(await searchAgentMemory(WS, agentId, "")).toHaveLength(2);
    // a query op was recorded
    expect(
      await prisma.memoryOperation.count({ where: { workspaceId: WS, agentId, opType: "query" } }),
    ).toBeGreaterThanOrEqual(2);

    // forget removes the entry + records a forget op
    const removed = await forgetAgentMemory(WS, agentId, hits[0].id);
    expect(removed).toBe(true);
    expect(await searchAgentMemory(WS, agentId, "postgres")).toHaveLength(0);
    expect(
      await prisma.memoryOperation.count({ where: { workspaceId: WS, agentId, opType: "forget" } }),
    ).toBe(1);

    // forgetting a non-existent / other-workspace entry is a no-op
    expect(await forgetAgentMemory(WS, agentId, "nope")).toBe(false);
  });

  it("searchAgentMemory + forgetAgentMemory over GraphQL (member reads, admin forgets)", async () => {
    const m = await appendAgentMemory({
      workspaceId: WS,
      agentId,
      content: "graphql recall target",
    });
    const search = await gql(
      `query{ searchAgentMemory(agentId:"${agentId}", query:"recall"){ id content } }`,
      "member",
    );
    expect(search.data.searchAgentMemory).toHaveLength(1);

    // member cannot forget
    const denied = await gql(
      `mutation{ forgetAgentMemory(agentId:"${agentId}", memoryId:"${m.id}") }`,
      "member",
    );
    expect(denied.errors).toBeDefined();
    // admin can
    const ok = await gql(
      `mutation{ forgetAgentMemory(agentId:"${agentId}", memoryId:"${m.id}") }`,
      "admin",
    );
    expect(ok.data.forgetAgentMemory).toBe(true);
  });
});

describe("memory cost-linkage (GAP-G)", () => {
  it("directly-billed op creates + links a CostEvent in the ledger", async () => {
    const op = await recordMemoryOperation({
      workspaceId: WS,
      agentId,
      provider: "db",
      opType: "query",
      inputTokens: 100,
      embeddingTokens: 40,
      outputTokens: 10,
      costCents: 7,
    });

    expect(op.costCents).toBe(7);
    expect(op.attributionMode).toBe("billed_directly");
    expect(op.costEventId).toBeTruthy();

    const event = await prisma.costEvent.findUniqueOrThrow({ where: { id: op.costEventId! } });
    expect(event).toMatchObject({
      workspaceId: WS,
      agentId,
      amountCents: 7,
      model: "memory:query",
      provider: "db",
      tokensIn: 140, // input + embedding
      tokensOut: 10,
      source: "agent",
    });
  });

  it("included_in_run records cost for visibility WITHOUT a new ledger entry, linking the run's event", async () => {
    const op = await recordMemoryOperation({
      workspaceId: WS,
      agentId,
      provider: "db",
      opType: "capture",
      costCents: 3,
      attributionMode: "included_in_run",
      costEventId: "run_evt_123",
    });
    expect(op.attributionMode).toBe("included_in_run");
    expect(op.costCents).toBe(3);
    expect(op.costEventId).toBe("run_evt_123");
    // No auto-created CostEvent (the id points at the run's pre-existing event, not a new row).
    expect(await prisma.costEvent.findUnique({ where: { id: "run_evt_123" } })).toBeNull();
  });

  it("free op records no cost + no ledger entry", async () => {
    const op = await recordMemoryOperation({
      workspaceId: WS,
      agentId,
      provider: "markdown",
      opType: "list",
    });
    expect(op.costCents).toBeNull();
    expect(op.costEventId).toBeNull();
    expect(op.attributionMode).toBeNull();
  });
});
