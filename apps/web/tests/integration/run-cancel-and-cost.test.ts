import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { invalidateFlagCache, setTestFeature } from "../../src/server/feature-flags";
import {
  runTaskInSandbox,
  enqueueSandboxRun,
  cancelAgentRun,
} from "../../src/server/services/sandbox-run";
import {
  registerRunAbort,
  unregisterRunAbort,
  isRunActive,
} from "../../src/server/services/run-cancellation";
import { registerAdapter, deriveAdapterExecutionResult, type Adapter } from "@agentcenter/utils";

// §3 #2 vertical slice — in-flight run cancellation + sandbox cost population. Exercised end-to-end
// against the REAL `local` provider (a child process on this host) so the AbortSignal → SIGKILL path,
// the terminal state transition, and the CostEvent emission are all real (not mocked).
const WS = "ws_cancelcost";
const LAYOUT = {
  instructionsFile: "AGENTS.md",
  skillsDir: "skills",
  identityFile: "IDENTITY.md",
  taskFile: "TASK.md",
};

/** An adapter whose runtime echoes a Claude stream-json transcript (model + usage) → cost is derived. */
function echoUsageAdapter(key: string, lines: string[]): Adapter {
  const cmd = `printf '%s\\n' ${lines.map((l) => `'${l.replace(/'/g, `'\\''`)}'`).join(" ")}`;
  return {
    key,
    displayName: key,
    requiresTemplate: false,
    supportsModel: false,
    models: [],
    build: (ctx) => ({
      mode: "spawn",
      argv: [cmd],
      cwd: ctx.workspaceDir,
      useShell: true,
      layout: LAYOUT,
    }),
    execute(input) {
      return deriveAdapterExecutionResult(this, input);
    },
  };
}

/** An adapter that just sleeps — long enough to be cancelled mid-flight. */
function sleepAdapter(key: string): Adapter {
  return {
    key,
    displayName: key,
    requiresTemplate: false,
    supportsModel: false,
    models: [],
    build: (ctx) => ({
      mode: "spawn",
      argv: ["sleep 20"],
      cwd: ctx.workspaceDir,
      useShell: true,
      layout: LAYOUT,
    }),
  };
}

const KNOWN_LINES = [
  `{"type":"system","subtype":"init","model":"claude-opus-4-8"}`,
  `{"type":"result","subtype":"success","is_error":false,"usage":{"input_tokens":1000000,"output_tokens":1000000}}`,
];
const UNKNOWN_LINES = [
  `{"type":"system","subtype":"init","model":"totally-unknown-model"}`,
  `{"type":"result","subtype":"success","is_error":false,"usage":{"input_tokens":1000,"output_tokens":2000}}`,
];

async function makeAgent(runtimeAdapter: string): Promise<string> {
  const agent = await prisma.agent.create({
    data: {
      name: "Cost/Cancel Agent",
      role: "worker",
      personality: "diligent",
      workspaceId: WS,
      setupStatus: "active",
      apiKeyHash: hashApiKey(`mc_cancelcost_${Math.random()}`),
      runtimeAdapter,
      sandboxProvider: "local",
    },
  });
  return agent.id;
}

async function makeTask(): Promise<string> {
  const task = await prisma.task.create({
    data: { title: "Do work", description: "x", status: "assigned", priority: "high", tags: [] },
  });
  return task.id;
}

beforeAll(() => {
  registerAdapter(echoUsageAdapter("cost-known", KNOWN_LINES));
  registerAdapter(echoUsageAdapter("cost-unknown", UNKNOWN_LINES));
  registerAdapter(sleepAdapter("cancel-sleep"));
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE cost_events, budget_policies, quota_windows, agent_runs, messages, tasks, agents, profiles CASCADE`,
  );
  setTestFeature("runners", true);
  invalidateFlagCache();
});

describe("sandbox cost population (§3 #2 cost half)", () => {
  it("prices a known model, persists costCents/costStatus, and emits an attributed CostEvent", async () => {
    const agentId = await makeAgent("cost-known");
    const taskId = await makeTask();

    const result = await runTaskInSandbox({
      workspaceId: WS,
      taskId,
      agentId,
      providerKey: "local",
    });
    expect(result.exitCode).toBe(0);

    // opus-4-8 @ 1M in / 1M out = $15 + $75 = $90 = 9000¢, priced.
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: result.runId } });
    expect(run.costCents).toBe(9000);
    expect(run.costStatus).toBe("reported");
    expect(run.usageModel).toBe("claude-opus-4-8");

    // …and a CostEvent attributing the spend to agent/model/task/run (idempotency key = run:<id>).
    const events = await prisma.costEvent.findMany({ where: { workspaceId: WS } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      agentId,
      taskId,
      model: "claude-opus-4-8",
      amountCents: 9000,
      costStatus: "reported",
      source: "run",
      idempotencyKey: `run:${result.runId}`,
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
    });
  });

  it("marks an unknown-model run unpriced (costCents 0) and emits an unpriced CostEvent", async () => {
    const agentId = await makeAgent("cost-unknown");
    const taskId = await makeTask();

    const result = await runTaskInSandbox({
      workspaceId: WS,
      taskId,
      agentId,
      providerKey: "local",
    });

    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: result.runId } });
    expect(run.costCents).toBe(0);
    expect(run.costStatus).toBe("unpriced");

    const events = await prisma.costEvent.findMany({ where: { workspaceId: WS } });
    expect(events).toHaveLength(1);
    expect(events[0].costStatus).toBe("unpriced");
    expect(events[0].amountCents).toBe(0);
    expect(events[0].model).toBe("totally-unknown-model");
  });
});

describe("run cancellation (§3 #2 cancellation half)", () => {
  it("cancels a QUEUED run (queued → canceled) with a reason, so the worker never claims it", async () => {
    const agentId = await makeAgent("cost-known");
    const taskId = await makeTask();
    const { runId } = await enqueueSandboxRun({ workspaceId: WS, taskId, agentId });

    const ok = await cancelAgentRun(WS, runId, "no longer needed");
    expect(ok).toBe(true);

    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe("canceled");
    expect(run.exitReason).toBe("canceled");
    expect(run.cancelReason).toBe("no longer needed");
  });

  it("does not cancel a run from another workspace", async () => {
    const agentId = await makeAgent("cost-known");
    const taskId = await makeTask();
    const { runId } = await enqueueSandboxRun({ workspaceId: WS, taskId, agentId });

    expect(await cancelAgentRun("ws_other", runId)).toBe(false);
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe("queued");
  });

  it("routes a cancel for a RUNNING, in-process run to its AbortController (aborts the exec)", async () => {
    const agentId = await makeAgent("cost-known");
    const taskId = await makeTask();
    // Simulate an actively-executing run: a running row + a live controller registered in-process.
    const run = await prisma.agentRun.create({
      data: { workspaceId: WS, agentId, taskId, kind: "sandbox", status: "running" },
    });
    const controller = registerRunAbort(run.id);
    try {
      expect(isRunActive(run.id)).toBe(true);
      const ok = await cancelAgentRun(WS, run.id, "operator abort");
      expect(ok).toBe(true);
      // The in-flight exec's signal is aborted with the reason → the provider kills the child.
      expect(controller.signal.aborted).toBe(true);
      expect((controller.signal.reason as Error).message).toBe("operator abort");
    } finally {
      unregisterRunAbort(run.id);
    }
  });

  it("terminates an actually-running sandbox exec end-to-end (running → canceled + reason)", async () => {
    const agentId = await makeAgent("cancel-sleep");
    const taskId = await makeTask();
    // Pre-create the ledger row so we know the runId, then run reusing it (kicks off `sleep 20`).
    const row = await prisma.agentRun.create({
      data: { workspaceId: WS, agentId, taskId, kind: "sandbox", status: "queued" },
    });
    const runPromise = runTaskInSandbox({
      workspaceId: WS,
      taskId,
      agentId,
      providerKey: "local",
      existingRunId: row.id,
    });

    // Wait until the exec is actually in-flight (controller registered), then cancel it.
    const start = Date.now();
    while (!isRunActive(row.id) && Date.now() - start < 8000) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(isRunActive(row.id)).toBe(true);
    const ok = await cancelAgentRun(WS, row.id, "terminated by test");
    expect(ok).toBe(true);

    // The run resolves promptly (the child was SIGKILLed — not after the full 20s sleep).
    await runPromise;

    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: row.id } });
    expect(run.status).toBe("canceled");
    expect(run.exitReason).toBe("canceled");
    expect(run.cancelReason).toBe("terminated by test");
    expect(Date.now() - start).toBeLessThan(15000);
  });
});
