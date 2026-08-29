import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { agentCache } from "../../src/server/cache";
import { createJWT } from "../../src/lib/jwt";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import { invalidateFlagCache, setTestFeature } from "../../src/server/feature-flags";
import { runTaskInSandbox } from "../../src/server/services/sandbox-run";
import {
  FLAG_KEYS,
  registerAdapter,
  deriveAdapterExecutionResult,
  type Adapter,
} from "@agentcenter/utils";

// PR #99 tail: the sandbox seam DERIVES a structured adapter execution result and now PERSISTS its
// usage/errorFamily/exitReason onto the AgentRun ledger (additive columns). This exercises that
// persistence end-to-end against the REAL `local` provider: a registered test adapter whose runtime
// echoes Claude stream-json, so the shared pure derivation extracts token usage / model / outcome.
const WS = "ws_runusage";
const LAYOUT = {
  instructionsFile: "AGENTS.md",
  skillsDir: "skills",
  identityFile: "IDENTITY.md",
  taskFile: "TASK.md",
};

// An adapter that owns execute() (so the seam runs the derivation) and whose build() echoes a
// Claude-style stream-json transcript. A success transcript carries model + token usage; an error
// transcript carries a classifiable failure string (usage-limit → provider_quota).
function echoAdapter(key: string, lines: string[]): Adapter {
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

const SUCCESS_LINES = [
  `{"type":"system","subtype":"init","model":"claude-opus-4-8"}`,
  `{"type":"result","subtype":"success","is_error":false,"usage":{"input_tokens":100,"output_tokens":50}}`,
];
const QUOTA_LINES = [`Claude usage limit reached. Try again later.`];

async function makeAgent(runtimeAdapter: string): Promise<string> {
  const agent = await prisma.agent.create({
    data: {
      name: "Usage Agent",
      role: "worker",
      personality: "diligent",
      workspaceId: WS,
      setupStatus: "active",
      apiKeyHash: hashApiKey(`mc_runusage_${Math.random()}`),
      runtimeAdapter,
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

const GQL_SECRET = "runusage-secret";
async function gql(query: string) {
  const token = await createJWT({ userId: "h", workspaceId: WS, userRole: "member" }, GQL_SECRET);
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
  process.env.SYSTEM_SECRET = GQL_SECRET;
  registerAdapter(echoAdapter("claude-usage-ok", SUCCESS_LINES));
  registerAdapter(echoAdapter("claude-usage-quota", QUOTA_LINES));
});
beforeEach(async () => {
  agentCache.clear();
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE agent_runs, messages, tasks, agents, profiles CASCADE`,
  );
  setTestFeature(FLAG_KEYS.RUNNERS, true);
  invalidateFlagCache();
});

describe("AgentRun structured execution result persistence (PR #99 tail)", () => {
  it("persists usage/model/exitReason for a successful structured result", async () => {
    const agentId = await makeAgent("claude-usage-ok");
    const taskId = await makeTask();

    const result = await runTaskInSandbox({
      workspaceId: WS,
      taskId,
      agentId,
      providerKey: "local",
    });
    expect(result.exitCode).toBe(0);
    // The structured result is returned…
    expect(result.execution?.usage).toEqual({
      tokensIn: 100,
      tokensOut: 50,
      model: "claude-opus-4-8",
    });
    expect(result.execution?.exitReason).toBe("completed");

    // …and persisted onto the AgentRun ledger.
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: result.runId } });
    expect(run.usageTokensIn).toBe(100);
    expect(run.usageTokensOut).toBe(50);
    expect(run.usageModel).toBe("claude-opus-4-8");
    expect(run.exitReason).toBe("completed");
    expect(run.errorFamily).toBeNull();

    // …and surfaced on the AgentRun GraphQL type.
    const res = await gql(
      `query{ agentRuns(taskId:"${taskId}"){ id usageTokensIn usageTokensOut usageModel errorFamily exitReason } }`,
    );
    expect(res.errors).toBeFalsy();
    const gqlRun = res.data.agentRuns.find((r: { id: string }) => r.id === result.runId);
    expect(gqlRun).toMatchObject({
      usageTokensIn: 100,
      usageTokensOut: 50,
      usageModel: "claude-opus-4-8",
      errorFamily: null,
      exitReason: "completed",
    });
  });

  it("persists a classified errorFamily + exitReason for a failed structured result", async () => {
    const agentId = await makeAgent("claude-usage-quota");
    const taskId = await makeTask();

    const result = await runTaskInSandbox({
      workspaceId: WS,
      taskId,
      agentId,
      providerKey: "local",
    });
    expect(result.execution?.errorFamily).toBe("provider_quota");

    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: result.runId } });
    expect(run.errorFamily).toBe("provider_quota");
    expect(run.exitReason).toBe("error");
  });
});
