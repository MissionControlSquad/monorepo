import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { agentCache } from "../../src/server/cache";
import { invalidateFlagCache, setTestFeature } from "../../src/server/feature-flags";
import { runTaskInSandbox } from "../../src/server/services/sandbox-run";
import { createSecret } from "../../src/server/services/secrets";

// PR #102 tail: a hermes-gateway-bound run dispatches via `runHermesGateway` (HTTP + SSE) instead of
// spawning a process inside a sandbox. The fetch/SSE is mocked (no network); we assert the run flows
// through the gateway seam, its streamed output/status land on the AgentRun ledger, the vaulted API key
// is resolved + redacted, and the structured usage/outcome is persisted.
const WS = "ws_hermesdispatch";
const API_KEY = "secret-server-key-123456";
const API_BASE = "https://hermes.example.test";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
      else controller.close();
    },
  });
}

async function makeHermesAgent(): Promise<string> {
  const agent = await prisma.agent.create({
    data: {
      name: "Hermes Agent",
      role: "worker",
      personality: "diligent",
      workspaceId: WS,
      setupStatus: "active",
      apiKeyHash: hashApiKey(`mc_hermes_${Math.random()}`),
      runtimeAdapter: "hermes-gateway",
      adapterType: "hermes-gateway",
      adapterConfig: {
        apiBaseUrl: API_BASE,
        apiKeySecretRef: "HERMES_KEY",
        sessionKeyStrategy: "run",
      },
      // A sandbox provider so admission passes; the gateway path never actually provisions it.
      sandboxProvider: "local",
    },
  });
  return agent.id;
}

async function makeTask(): Promise<string> {
  const task = await prisma.task.create({
    data: {
      title: "Fix nav",
      description: "broken",
      status: "assigned",
      priority: "high",
      tags: [],
    },
  });
  return task.id;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = "hermes-dispatch-secret";
});
beforeEach(async () => {
  agentCache.clear();
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE agent_runs, messages, tasks, agents, profiles, secrets CASCADE`,
  );
  setTestFeature("runners", true);
  invalidateFlagCache();
  await createSecret({ workspaceId: WS, name: "HERMES_KEY", value: API_KEY, createdBy: "h" });
});

describe("Hermes gateway run dispatch (PR #102 tail)", () => {
  it("dispatches a hermes-gateway run via runHermesGateway (not a spawn) and lands output/status/usage", async () => {
    const events = [
      'event: message.delta\ndata: {"event":"message.delta","delta":"Hello "}\n\n',
      'event: message.delta\ndata: {"event":"message.delta","delta":"world"}\n\n',
      'event: run.completed\ndata: {"status":"completed","output":"Hello world","usage":{"input_tokens":10,"output_tokens":5}}\n\n',
    ];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = typeof url === "string" ? url : url.toString();
      if (init?.method === "POST") {
        expect(href).toBe(`${API_BASE}/v1/runs`);
        return new Response(JSON.stringify({ run_id: "run_srv_1" }), { status: 200 });
      }
      expect(href).toContain("/v1/runs/run_srv_1/events");
      return new Response(streamOf(events), { status: 200 });
    }) as unknown as typeof fetch;

    const agentId = await makeHermesAgent();
    const taskId = await makeTask();

    const result = await runTaskInSandbox({
      workspaceId: WS,
      taskId,
      agentId,
      providerKey: "local",
      fetchImpl,
    });

    // Dispatched via the gateway (POST run + GET events) — a process was never spawned.
    expect(fetchImpl).toHaveBeenCalled();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]?.method).toBe(
      "POST",
    );
    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("review");
    expect(result.stdout).toContain("Hello world");
    expect(result.execution?.exitReason).toBe("completed");

    // The run ledger row records the gateway kind, terminal status, and structured usage.
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: result.runId } });
    expect(run.kind).toBe("gateway");
    expect(run.status).toBe("done");
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("Hello world");
    expect(run.usageTokensIn).toBe(10);
    expect(run.usageTokensOut).toBe(5);
    expect(run.exitReason).toBe("completed");
    expect(run.sandboxId).toBe("run_srv_1");

    // The outcome is posted to the task timeline as the agent.
    const messages = await prisma.message.findMany({ where: { taskId } });
    expect(messages.some((m) => m.content.includes("Hermes gateway run"))).toBe(true);
  });

  it("redacts the resolved API key from persisted output", async () => {
    const leaky =
      `event: message.delta\ndata: {"event":"message.delta","delta":"key is ${API_KEY}"}\n\n` +
      `event: run.completed\ndata: {"status":"completed","output":"done"}\n\n`;
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ run_id: "r" }), { status: 200 })
        : new Response(streamOf([leaky]), { status: 200 }),
    ) as unknown as typeof fetch;

    const agentId = await makeHermesAgent();
    const taskId = await makeTask();
    const result = await runTaskInSandbox({
      workspaceId: WS,
      taskId,
      agentId,
      providerKey: "local",
      fetchImpl,
    });

    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: result.runId } });
    expect(run.stdout ?? "").not.toContain(API_KEY);
    expect(result.stdout).not.toContain(API_KEY);
  });

  it("records a shaped auth failure (401) as a failed run with an auth_required family", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    ) as unknown as typeof fetch;

    const agentId = await makeHermesAgent();
    const taskId = await makeTask();
    const result = await runTaskInSandbox({
      workspaceId: WS,
      taskId,
      agentId,
      providerKey: "local",
      fetchImpl,
    });

    expect(result.exitCode).toBe(1);
    expect(result.status).toBe("blocked");
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: result.runId } });
    expect(run.status).toBe("failed");
    expect(run.errorFamily).toBe("auth_required");
    expect(run.exitReason).toBe("auth_required");
    // the key never appears in any persisted field
    expect(JSON.stringify(run)).not.toContain(API_KEY);
  });
});
