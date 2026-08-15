import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import { POST as _BRIDGE_MEMORY } from "../../app/api/runner/bridge/memory/route";
// memory route is now wrapped by withFeature (2-arg); it is static, so supply a dummy ctx.
const BRIDGE_MEMORY = (req: Request) => _BRIDGE_MEMORY(req, undefined as never);
import { attachRunBridgeToken } from "../../src/server/services/run-bridge";
import {
  appendAgentMemory,
  readAgentMemory,
  searchAgentMemory,
  assembleInjectedMemory,
  captureRunMemory,
  recordMemoryOperation,
  resolveEffectiveMemoryProvider,
  setCompanyDefaultMemoryProvider,
  correctAgentMemory,
  listAgentMemory,
  upsertAgentMemoryRecord,
} from "../../src/server/services/agent-memory";
import { enqueueOrCaptureRunMemory, drainMemoryJobs } from "../../src/server/services/memory-jobs";

// §3 memory — the behavior/regression eval suite the prior analysis flagged as missing. Deterministic
// vitest (no LLM harness): binding precedence, provenance stamping, cost attribution, ranked recall
// ordering, the three new op-types (correct / list / record_upsert), and wake-driven capture.
const WS = "ws_mem_behavior";

async function enableFlag(key: string, on = true) {
  await prisma.featureFlag.upsert({
    where: { key },
    create: { key, enabled: on, managedBy: "user" },
    update: { enabled: on },
  });
  invalidateFlagCache();
}

async function makeAgent(suffix: string, provider: string | null = "db") {
  return prisma.agent.create({
    data: {
      name: `A_${suffix}`,
      role: "worker",
      personality: "x",
      workspaceId: WS,
      setupStatus: "active",
      memoryProvider: provider ?? undefined,
      apiKeyHash: hashApiKey(`mc_mb_${suffix}_${Math.random()}`),
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
  process.env.SYSTEM_SECRET = "mem-behavior-secret";
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE agent_runs, memory_operations, memory_jobs, agent_memories, workspace_memory_settings, cost_events, tasks, agents, profiles CASCADE`,
  );
  await enableFlag("runners", true);
  await enableFlag("memory", true);
});

describe("binding resolution precedence (agent → company → none)", () => {
  it("agent override wins; else company default; else none", async () => {
    // No company default set → none.
    expect(await resolveEffectiveMemoryProvider(WS, null)).toBe("none");
    // Company default applies when the agent has no override.
    await setCompanyDefaultMemoryProvider(WS, "db");
    expect(await resolveEffectiveMemoryProvider(WS, null)).toBe("db");
    // Agent override beats the company default.
    expect(await resolveEffectiveMemoryProvider(WS, "markdown")).toBe("markdown");
    // An invalid override falls through to the company default.
    expect(await resolveEffectiveMemoryProvider(WS, "bogus")).toBe("db");
  });
});

describe("provenance stamping (sourceKind + scope)", () => {
  it("captured run memory stamps run provenance scoped to the workspace+agent", async () => {
    const agent = await makeAgent("prov");
    const entry = await captureRunMemory({
      workspaceId: WS,
      agentId: agent.id,
      agentProvider: "db",
      taskId: "task_1",
      runId: "run_1",
      summary: "did the thing",
    });
    expect(entry).toMatchObject({
      workspaceId: WS,
      agentId: agent.id,
      sourceKind: "run",
      sourceTaskId: "task_1",
      sourceRefId: "run_1",
    });
    const op = await prisma.memoryOperation.findFirst({
      where: { workspaceId: WS, agentId: agent.id, opType: "capture" },
    });
    expect(op).toMatchObject({
      sourceKind: "run",
      runId: "run_1",
      attributionMode: "included_in_run",
    });
  });

  it("an agent can never touch another agent's memory (scope isolation)", async () => {
    const a = await makeAgent("iso_a");
    const b = await makeAgent("iso_b");
    const noted = await appendAgentMemory({ workspaceId: WS, agentId: a.id, content: "a-secret" });
    // b's recall never surfaces a's entry.
    expect(await searchAgentMemory(WS, b.id, "secret")).toHaveLength(0);
    // b's correct/upsert can't reach a's entry.
    expect(await correctAgentMemory(WS, b.id, noted.id, "hijack")).toBeNull();
  });
});

describe("cost attribution (a billed memory op links a CostEvent)", () => {
  it("a directly-billed capture creates + links a ledger CostEvent", async () => {
    const agent = await makeAgent("cost");
    const op = await recordMemoryOperation({
      workspaceId: WS,
      agentId: agent.id,
      provider: "db",
      opType: "capture",
      inputTokens: 200,
      embeddingTokens: 50,
      outputTokens: 20,
      costCents: 5,
    });
    expect(op.attributionMode).toBe("billed_directly");
    expect(op.costEventId).toBeTruthy();
    const event = await prisma.costEvent.findUniqueOrThrow({ where: { id: op.costEventId! } });
    expect(event).toMatchObject({
      workspaceId: WS,
      agentId: agent.id,
      amountCents: 5,
      model: "memory:capture",
      tokensIn: 250,
      tokensOut: 20,
      source: "agent",
    });
  });

  it("an included_in_run op links the run's event without a new ledger row", async () => {
    const agent = await makeAgent("cost_run");
    const op = await recordMemoryOperation({
      workspaceId: WS,
      agentId: agent.id,
      provider: "db",
      opType: "capture",
      costCents: 2,
      attributionMode: "included_in_run",
      costEventId: "run_evt_1",
    });
    expect(op.attributionMode).toBe("included_in_run");
    expect(op.costEventId).toBe("run_evt_1");
    expect(await prisma.costEvent.findUnique({ where: { id: "run_evt_1" } })).toBeNull();
  });
});

describe("ranked recall ordering (recency + relevance)", () => {
  it("a task's terms bias recall toward a relevant older memory over fresh noise", async () => {
    const agent = await makeAgent("rank");
    // Older but relevant.
    const relevant = await appendAgentMemory({
      workspaceId: WS,
      agentId: agent.id,
      content: "the deploy pipeline runs on staging via vercel",
    });
    await prisma.agentMemory.update({
      where: { id: relevant.id },
      data: { createdAt: new Date(Date.now() - 20 * 86_400_000) },
    });
    // Fresh but irrelevant.
    await appendAgentMemory({ workspaceId: WS, agentId: agent.id, content: "lunch menu ideas" });

    const task = await prisma.task.create({
      data: { title: "Fix deploy pipeline", description: "staging vercel", status: "assigned" },
    });
    const injected = await assembleInjectedMemory(WS, agent.id, { taskId: task.id });
    expect(injected).toContain("deploy pipeline");
    // A query op was logged for the recall.
    expect(
      await prisma.memoryOperation.count({ where: { agentId: agent.id, opType: "query" } }),
    ).toBeGreaterThanOrEqual(1);
  });

  it("with no task context, recall is pure recency (newest first)", async () => {
    const agent = await makeAgent("recency");
    const first = await appendAgentMemory({ workspaceId: WS, agentId: agent.id, content: "first" });
    await prisma.agentMemory.update({
      where: { id: first.id },
      data: { createdAt: new Date(Date.now() - 3 * 86_400_000) },
    });
    await appendAgentMemory({ workspaceId: WS, agentId: agent.id, content: "second" });
    const rows = await readAgentMemory(WS, agent.id);
    expect(rows.map((r) => r.content)).toEqual(["second", "first"]);
  });
});

describe("op-type: memory.correct (supersede + preserve provenance)", () => {
  it("supersedes the old entry, preserves provenance, and drops it from recall", async () => {
    const agent = await makeAgent("correct");
    const old = await appendAgentMemory({
      workspaceId: WS,
      agentId: agent.id,
      content: "the api base is http://old",
      sourceTaskId: "task_x",
      sourceKind: "run",
      sourceRefId: "run_x",
    });
    const replacement = await correctAgentMemory(
      WS,
      agent.id,
      old.id,
      "the api base is http://new",
    );
    expect(replacement).not.toBeNull();
    // Provenance is preserved onto the replacement.
    expect(replacement).toMatchObject({
      sourceTaskId: "task_x",
      sourceKind: "run",
      sourceRefId: "run_x",
    });
    // Old row is stamped superseded and no longer recalled; only the replacement surfaces.
    const oldRow = await prisma.agentMemory.findUnique({ where: { id: old.id } });
    expect(oldRow?.supersededById).toBe(replacement!.id);
    expect(oldRow?.supersededAt).not.toBeNull();
    const recall = await searchAgentMemory(WS, agent.id, "api base");
    expect(recall).toHaveLength(1);
    expect(recall[0].id).toBe(replacement!.id);
    // A correct op was recorded with the old entry as its subject.
    const op = await prisma.memoryOperation.findFirst({
      where: { agentId: agent.id, opType: "correct" },
    });
    expect(op).toMatchObject({ subjectId: old.id, resultCount: 1 });
  });

  it("correcting a missing / already-corrected entry is a no-op that logs a failed op", async () => {
    const agent = await makeAgent("correct_noop");
    expect(await correctAgentMemory(WS, agent.id, "nope", "x")).toBeNull();
    const op = await prisma.memoryOperation.findFirst({
      where: { agentId: agent.id, opType: "correct" },
    });
    expect(op?.success).toBe(false);
  });
});

describe("op-type: memory.list (paginated enumeration)", () => {
  it("lists newest-first, paginates, and records a list op", async () => {
    const agent = await makeAgent("list");
    for (let i = 0; i < 5; i++) {
      const e = await appendAgentMemory({
        workspaceId: WS,
        agentId: agent.id,
        content: `note ${i}`,
      });
      await prisma.agentMemory.update({
        where: { id: e.id },
        data: { createdAt: new Date(Date.now() + i * 1000) },
      });
    }
    const page1 = await listAgentMemory(WS, agent.id, { limit: 2, offset: 0 });
    expect(page1.items.map((r) => r.content)).toEqual(["note 4", "note 3"]);
    expect(page1.nextOffset).toBe(2);
    const page3 = await listAgentMemory(WS, agent.id, { limit: 2, offset: 4 });
    expect(page3.items.map((r) => r.content)).toEqual(["note 0"]);
    expect(page3.nextOffset).toBeNull();
    expect(
      await prisma.memoryOperation.count({ where: { agentId: agent.id, opType: "list" } }),
    ).toBe(2);
  });
});

describe("op-type: memory.record_upsert (idempotent keyed dedupe)", () => {
  it("first upsert inserts, re-upsert with same key updates the same row", async () => {
    const agent = await makeAgent("upsert");
    const a = await upsertAgentMemoryRecord(WS, agent.id, "profile", "likes dark mode");
    expect(a?.created).toBe(true);
    const b = await upsertAgentMemoryRecord(WS, agent.id, "profile", "likes light mode");
    expect(b?.created).toBe(false);
    expect(b?.entry.id).toBe(a?.entry.id); // same row, deduped by key
    // Only ONE row for that key; content is the latest.
    const rows = await prisma.agentMemory.findMany({
      where: { workspaceId: WS, agentId: agent.id, recordKey: "profile" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("likes light mode");
    // A different key inserts a distinct row.
    const c = await upsertAgentMemoryRecord(WS, agent.id, "env", "prod is us-east");
    expect(c?.created).toBe(true);
    expect(
      await prisma.memoryOperation.count({ where: { agentId: agent.id, opType: "record_upsert" } }),
    ).toBe(3);
  });
});

describe("op-types through the bridge (flag + token gated)", () => {
  it("note → correct → list → record_upsert over the bridge route", async () => {
    const agent = await makeAgent("bridge");
    const { run, token } = await makeRunningRun(agent.id);

    // note
    const noted = await BRIDGE_MEMORY(memoryReq(token, { op: "note", content: "base is v1" }));
    expect(noted.status).toBe(201);
    const notedBody = (await noted.json()) as { id: string };

    // correct
    const corrected = await BRIDGE_MEMORY(
      memoryReq(token, { op: "correct", memoryId: notedBody.id, content: "base is v2" }),
    );
    expect(corrected.status).toBe(201);
    const correctedBody = (await corrected.json()) as { id: string };
    expect(correctedBody.id).not.toBe(notedBody.id);
    // correction carries run provenance.
    const row = await prisma.agentMemory.findUnique({ where: { id: correctedBody.id } });
    expect(row).toMatchObject({ sourceKind: "run", sourceRefId: run.id });

    // list returns only the live (corrected) entry
    const listed = await BRIDGE_MEMORY(memoryReq(token, { op: "list", limit: 10 }));
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as {
      results: Array<{ id: string }>;
      nextOffset: number | null;
    };
    expect(listBody.results.map((r) => r.id)).toEqual([correctedBody.id]);
    expect(listBody.nextOffset).toBeNull();

    // record_upsert: create then update-in-place
    const up1 = await BRIDGE_MEMORY(
      memoryReq(token, { op: "record_upsert", key: "k1", content: "first" }),
    );
    expect(up1.status).toBe(201);
    expect((await up1.json()).created).toBe(true);
    const up2 = await BRIDGE_MEMORY(
      memoryReq(token, { op: "record_upsert", key: "k1", content: "second" }),
    );
    expect(up2.status).toBe(200);
    expect((await up2.json()).created).toBe(false);
  });

  it("gates the new ops on the MEMORY flag (403 when disabled)", async () => {
    const agent = await makeAgent("bridge_flag");
    const { token } = await makeRunningRun(agent.id);
    await enableFlag("memory", false);
    for (const body of [
      { op: "correct", memoryId: "x", content: "y" },
      { op: "list" },
      { op: "record_upsert", key: "k", content: "v" },
    ]) {
      expect((await BRIDGE_MEMORY(memoryReq(token, body))).status).toBe(403);
    }
  });

  it("rejects a finished run's token for the new ops (401)", async () => {
    const agent = await makeAgent("bridge_tok");
    const { run, token } = await makeRunningRun(agent.id);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "done" } });
    expect((await BRIDGE_MEMORY(memoryReq(token, { op: "list" }))).status).toBe(401);
  });
});

describe("wake-driven / heartbeat run capture (no run path is memory-blind)", () => {
  it("inline capture (MEMORY off) writes a run-provenance entry", async () => {
    const agent = await makeAgent("wake_inline");
    await enableFlag("memory", false);
    await enqueueOrCaptureRunMemory({
      workspaceId: WS,
      agentId: agent.id,
      agentProvider: "db",
      taskId: "task_w",
      runId: "run_w",
      summary: "wake-driven run residue",
    });
    const rows = await readAgentMemory(WS, agent.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceKind: "run", sourceRefId: "run_w" });
  });

  it("durable capture (MEMORY on): enqueues a job that drains into a run-provenance entry", async () => {
    const agent = await makeAgent("wake_job");
    await enqueueOrCaptureRunMemory({
      workspaceId: WS,
      agentId: agent.id,
      agentProvider: "db",
      taskId: "task_j",
      runId: "run_j",
      summary: "durable wake residue",
    });
    // A job is queued; nothing captured yet.
    expect(await readAgentMemory(WS, agent.id)).toHaveLength(0);
    expect(await prisma.memoryJob.count({ where: { workspaceId: WS, agentId: agent.id } })).toBe(1);
    // Draining the queue performs the capture with run provenance.
    const res = await drainMemoryJobs();
    expect(res.completed).toBe(1);
    const rows = await readAgentMemory(WS, agent.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceKind: "run", sourceRefId: "run_j" });
  });

  it("capture is a no-op for a none-provider agent (nothing stored)", async () => {
    const agent = await makeAgent("wake_none", "none");
    await enableFlag("memory", false);
    await enqueueOrCaptureRunMemory({
      workspaceId: WS,
      agentId: agent.id,
      agentProvider: "none",
      taskId: "task_n",
      runId: "run_n",
      summary: "should not persist",
    });
    expect(await readAgentMemory(WS, agent.id)).toHaveLength(0);
  });
});
