import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { agentCache } from "../../src/server/cache";
import { createJWT } from "../../src/lib/jwt";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import {
  runTaskInSandbox,
  composeSandboxScript,
  enqueueSandboxRun,
  drainSandboxRunQueue,
  cancelAgentRun,
  autoDispatchSandboxForAssignment,
} from "../../src/server/services/sandbox-run";
import { getOrCreateAgentProfileId } from "../../src/server/agent-profile";
import { createEnvironment } from "../../src/server/services/environments";

// Tier D: the sandbox EXECUTION SEAM. Exercised end-to-end against the REAL `local` provider (temp
// dir + child_process, no keys) — proving provision → materialise the task → run the runtime → capture
// → destroy actually works. Cloud providers reuse this exact seam (their SDK is mocked in their tests).
const WS = "ws_sbxrun";

async function makeAgent(
  sandboxProvider?: string,
  trustLevel?: "untrusted" | "low" | "standard" | "trusted",
): Promise<string> {
  const agent = await prisma.agent.create({
    data: {
      name: "Sbx Agent",
      role: "worker",
      personality: "diligent",
      workspaceId: WS,
      setupStatus: "active",
      apiKeyHash: hashApiKey(`mc_sbxrun_${Math.random()}`),
      // A shell runtime whose command echoes a marker and reads the task the seam wrote into TASK.md.
      runtimeAdapter: "shell",
      runtimeTemplate: "echo SANDBOX_RAN && cat TASK.md",
      sandboxProvider: sandboxProvider ?? null,
      trustLevel: trustLevel ?? null,
    },
  });
  return agent.id;
}

/** An unscoped task (projectId null) — accessible to any agent, and no repo → no git clone. */
async function makeTask(): Promise<string> {
  const task = await prisma.task.create({
    data: {
      title: "Fix nav",
      description: "the navbar is broken",
      status: "assigned",
      priority: "high",
      tags: [],
    },
  });
  return task.id;
}

const GQL_SECRET = "sbxrun-secret";
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
});
beforeEach(async () => {
  agentCache.clear();
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE agent_runs, messages, tasks, agent_skills, skills, agent_instructions, agents, profiles, environments CASCADE`,
  );
  await prisma.featureFlag.upsert({
    where: { key: "runners" },
    create: { key: "runners", enabled: true, managedBy: "user" },
    update: { enabled: true },
  });
  invalidateFlagCache();
});

describe("composeSandboxScript (Phase 2 — runtime install + secrets-into-box)", () => {
  it("exports the agent's secrets, writes TASK.md, and idempotently installs the runtime", () => {
    const s = composeSandboxScript({
      prompt: "# Task #1: Fix nav",
      repoUrl: "https://github.com/acme/site.git",
      runtimeCmd: "codex exec",
      installGuard: "command -v codex >/dev/null 2>&1 || { npm install -g @openai/codex; }",
      env: { OPENAI_API_KEY: "sk-vault", ANTHROPIC_API_KEY: "ak-vault" },
    });
    // secrets exported (so a real runtime + clone auth can use them)
    expect(s).toContain("export OPENAI_API_KEY='sk-vault'");
    expect(s).toContain("export ANTHROPIC_API_KEY='ak-vault'");
    // idempotent runtime install
    expect(s).toContain("command -v codex");
    expect(s).toContain("npm install -g @openai/codex");
    // task materialised + repo cloned + runtime run
    expect(s).toContain("cat > TASK.md");
    expect(s).toContain("git clone --depth 1 'https://github.com/acme/site.git'");
    expect(s).toContain("codex exec");
  });

  it("omits install/exports when the adapter has no binary and no secrets are bound", () => {
    const s = composeSandboxScript({ prompt: "x", runtimeCmd: "echo hi" });
    expect(s).not.toContain("command -v");
    expect(s).not.toContain("export ");
    expect(s).not.toContain("git clone");
    expect(s).toContain("echo hi");
  });

  it("wires a git credential helper for a private repo (token never in the URL)", () => {
    const s = composeSandboxScript({
      prompt: "x",
      repoUrl: "https://github.com/acme/private.git",
      runtimeCmd: "echo hi",
      gitToken: "ghp_secret",
    });
    expect(s).toContain("export PC_GIT_TOKEN='ghp_secret'");
    expect(s).toContain("credential.helper");
    expect(s).toContain("git clone --depth 1 'https://github.com/acme/private.git'");
    // the token must NOT be embedded into the clone URL / remote
    expect(s).not.toContain("ghp_secret@github.com");
  });

  it("no git credential helper without a token", () => {
    const s = composeSandboxScript({
      prompt: "x",
      repoUrl: "https://github.com/acme/repo.git",
      runtimeCmd: "echo hi",
    });
    expect(s).not.toContain("PC_GIT_TOKEN");
    expect(s).not.toContain("credential.helper");
  });
});

describe("sandbox task execution (Tier D)", () => {
  it("runs a task in the REAL local sandbox and returns the captured output", async () => {
    const agentId = await makeAgent();
    const taskId = await makeTask();

    const result = await runTaskInSandbox({
      workspaceId: WS,
      taskId,
      agentId,
      providerKey: "local",
    });

    expect(result.providerKey).toBe("local");
    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("review");
    // The runtime ran inside the sandbox…
    expect(result.stdout).toContain("SANDBOX_RAN");
    // …and read TASK.md that the seam materialised (proves the bundle reached the sandbox).
    expect(result.stdout).toContain("Fix nav");

    // The execution is persisted in the AgentRun ledger.
    expect(result.runId).toBeTruthy();
    const run = await prisma.agentRun.findUnique({ where: { id: result.runId } });
    expect(run).toMatchObject({
      kind: "sandbox",
      providerKey: "local",
      status: "done",
      exitCode: 0,
      agentId,
      taskId,
    });
    expect(run?.stdout).toContain("SANDBOX_RAN");
    expect(run?.finishedAt).toBeTruthy();

    // The outcome is posted to the task timeline as a message from the agent.
    const messages = await prisma.message.findMany({ where: { taskId } });
    expect(messages.some((m) => m.content.includes("SANDBOX_RAN"))).toBe(true);
  });

  it("exposes the persisted run via the agentRuns query (RUNNERS-gated)", async () => {
    const agentId = await makeAgent();
    const taskId = await makeTask();
    const result = await runTaskInSandbox({
      workspaceId: WS,
      taskId,
      agentId,
      providerKey: "local",
    });

    const res = await gql(
      `query{ agentRuns(taskId:"${taskId}"){ id kind providerKey status exitCode } }`,
    );
    expect(res.errors).toBeFalsy();
    const run = res.data.agentRuns.find((r: { id: string }) => r.id === result.runId);
    expect(run).toMatchObject({
      kind: "sandbox",
      providerKey: "local",
      status: "done",
      exitCode: 0,
    });
  });

  it("uses the agent's configured sandboxProvider when no override is passed", async () => {
    const agentId = await makeAgent("local");
    const taskId = await makeTask();
    const result = await runTaskInSandbox({ workspaceId: WS, taskId, agentId });
    expect(result.providerKey).toBe("local");
    expect(result.exitCode).toBe(0);
  });

  it("errors clearly when no provider is configured or passed", async () => {
    const agentId = await makeAgent(); // no sandboxProvider
    const taskId = await makeTask();
    await expect(runTaskInSandbox({ workspaceId: WS, taskId, agentId })).rejects.toThrow(
      /No sandbox provider/i,
    );
  });

  it("errors on an unknown provider key", async () => {
    const agentId = await makeAgent();
    const taskId = await makeTask();
    await expect(
      runTaskInSandbox({ workspaceId: WS, taskId, agentId, providerKey: "nope" }),
    ).rejects.toThrow(/Unknown sandbox provider/i);
  });

  it("fail-closed admission: a low-trust agent cannot run on the non-isolating local provider", async () => {
    const agentId = await makeAgent("local", "low");
    const taskId = await makeTask();
    await expect(runTaskInSandbox({ workspaceId: WS, taskId, agentId })).rejects.toThrow(
      /low-trust|isolated sandbox|runs on the host/i,
    );
  });

  it("marks a run that exceeds its timeout as `timeout` (killed), not `failed`", async () => {
    // An agent whose runtime blocks longer than the timeout budget.
    const agent = await prisma.agent.create({
      data: {
        name: "Slow Agent",
        role: "worker",
        personality: "diligent",
        workspaceId: WS,
        setupStatus: "active",
        apiKeyHash: hashApiKey(`mc_slow_${Math.random()}`),
        runtimeAdapter: "shell",
        runtimeTemplate: "echo START && sleep 30",
        sandboxProvider: "local",
      },
    });
    const taskId = await makeTask();

    const result = await runTaskInSandbox({
      workspaceId: WS,
      taskId,
      agentId: agent.id,
      timeoutMs: 500,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.status).toBe("blocked");

    const run = await prisma.agentRun.findUnique({ where: { id: result.runId } });
    expect(run?.status).toBe("timeout");
    expect(run?.stderr).toContain("exceeded timeout");
  });

  it("scopes the agent to the workspace (foreign agent → not found)", async () => {
    const agentId = await makeAgent("local");
    const taskId = await makeTask();
    await expect(runTaskInSandbox({ workspaceId: "ws_other", taskId, agentId })).rejects.toThrow(
      /Agent not found/i,
    );
  });
});

describe("async sandbox runs (enqueue → drain → cancel)", () => {
  it("enqueues a queued run, then the worker drains + executes it", async () => {
    const agentId = await makeAgent("local");
    const taskId = await makeTask();

    const { runId } = await enqueueSandboxRun({ workspaceId: WS, taskId, agentId });
    // queued, not yet run
    let run = await prisma.agentRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe("queued");
    expect(run?.exitCode).toBeNull();

    const started = await drainSandboxRunQueue();
    expect(started).toBeGreaterThanOrEqual(1);

    run = await prisma.agentRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe("done");
    expect(run?.exitCode).toBe(0);
    expect(run?.stdout).toContain("SANDBOX_RAN");
  });

  it("enqueue enforces admission (low-trust → local denied, nothing queued)", async () => {
    const agentId = await makeAgent("local", "low");
    const taskId = await makeTask();
    await expect(enqueueSandboxRun({ workspaceId: WS, taskId, agentId })).rejects.toThrow(
      /isolated sandbox|low-trust/i,
    );
    expect(await prisma.agentRun.count({ where: { agentId } })).toBe(0);
  });

  it("cancels a queued run so the worker skips it", async () => {
    const agentId = await makeAgent("local");
    const taskId = await makeTask();
    const { runId } = await enqueueSandboxRun({ workspaceId: WS, taskId, agentId });

    expect(await cancelAgentRun(WS, runId)).toBe(true);
    expect((await prisma.agentRun.findUnique({ where: { id: runId } }))?.status).toBe("canceled");

    await drainSandboxRunQueue();
    // still canceled — never picked up
    expect((await prisma.agentRun.findUnique({ where: { id: runId } }))?.status).toBe("canceled");
  });

  it("auto-dispatches a queued run when a sandbox-bound agent is assigned (deduped)", async () => {
    const agentId = await makeAgent("local");
    const taskId = await makeTask();
    const profileId = await getOrCreateAgentProfileId(agentId);

    const enqueued = await autoDispatchSandboxForAssignment(taskId, [profileId]);
    expect(enqueued).toHaveLength(1);
    expect(await prisma.agentRun.findUnique({ where: { id: enqueued[0] } })).toMatchObject({
      status: "queued",
      kind: "sandbox",
      agentId,
      taskId,
      providerKey: "local",
    });
    // dedup: a re-assignment while a run is queued must NOT double-dispatch
    expect(await autoDispatchSandboxForAssignment(taskId, [profileId])).toHaveLength(0);
  });

  it("does not auto-dispatch for an agent without a sandbox provider", async () => {
    const agentId = await makeAgent(); // no sandboxProvider
    const taskId = await makeTask();
    const profileId = await getOrCreateAgentProfileId(agentId);
    expect(await autoDispatchSandboxForAssignment(taskId, [profileId])).toHaveLength(0);
  });
});

describe("environment-driven execution (Plan 1 wiring)", () => {
  /** An agent bound to an environment (no ad-hoc sandboxProvider). */
  async function agentInEnv(environmentId: string, template = "echo SANDBOX_RAN"): Promise<string> {
    const agent = await prisma.agent.create({
      data: {
        name: "Env Agent",
        role: "worker",
        personality: "diligent",
        workspaceId: WS,
        setupStatus: "active",
        apiKeyHash: hashApiKey(`mc_env_${Math.random()}`),
        runtimeAdapter: "shell",
        runtimeTemplate: template,
        environmentId,
      },
    });
    return agent.id;
  }

  it("runs via the agent's bound sandbox Environment (provider from env config)", async () => {
    const env = await createEnvironment(WS, {
      name: "Sbx",
      driver: "sandbox",
      config: { provider: "local" },
    });
    const agentId = await agentInEnv(env.id);
    const taskId = await makeTask();

    const result = await runTaskInSandbox({ workspaceId: WS, taskId, agentId });
    expect(result.providerKey).toBe("local");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("SANDBOX_RAN");
  });

  it("runs via a local-driver Environment on the local provider", async () => {
    const env = await createEnvironment(WS, { name: "Loc", driver: "local" });
    const agentId = await agentInEnv(env.id);
    const taskId = await makeTask();
    const result = await runTaskInSandbox({ workspaceId: WS, taskId, agentId });
    expect(result.providerKey).toBe("local");
    expect(result.exitCode).toBe(0);
  });

  it("injects the Environment's instance env vars into the run", async () => {
    const env = await createEnvironment(WS, {
      name: "SbxVars",
      driver: "sandbox",
      config: { provider: "local" },
      envVars: { MY_ENV_VAR: "env-value-123" },
    });
    const agentId = await agentInEnv(env.id, "echo VAR=$MY_ENV_VAR");
    const taskId = await makeTask();
    const result = await runTaskInSandbox({ workspaceId: WS, taskId, agentId });
    expect(result.stdout).toContain("VAR=env-value-123");
  });

  it("rejects an ssh/plugin Environment (not yet runnable via the sandbox seam)", async () => {
    const env = await createEnvironment(WS, {
      name: "Ssh",
      driver: "ssh",
      config: { host: "1.2.3.4" },
    });
    const agentId = await agentInEnv(env.id);
    const taskId = await makeTask();
    await expect(runTaskInSandbox({ workspaceId: WS, taskId, agentId })).rejects.toThrow(
      /not yet runnable/i,
    );
  });

  it("auto-dispatches an env-bound agent that has no ad-hoc sandbox provider", async () => {
    const env = await createEnvironment(WS, {
      name: "SbxAuto",
      driver: "sandbox",
      config: { provider: "local" },
    });
    const agentId = await agentInEnv(env.id);
    const taskId = await makeTask();
    const profileId = await getOrCreateAgentProfileId(agentId);
    const enqueued = await autoDispatchSandboxForAssignment(taskId, [profileId]);
    expect(enqueued).toHaveLength(1);
    expect((await prisma.agentRun.findUnique({ where: { id: enqueued[0] } }))?.status).toBe(
      "queued",
    );
  });

  it("an explicit provider override bypasses the Environment", async () => {
    const env = await createEnvironment(WS, {
      name: "SbxOverride",
      driver: "ssh", // would normally be rejected…
      config: { host: "1.2.3.4" },
    });
    const agentId = await agentInEnv(env.id);
    const taskId = await makeTask();
    // …but the explicit override wins and runs locally.
    const result = await runTaskInSandbox({
      workspaceId: WS,
      taskId,
      agentId,
      providerKey: "local",
    });
    expect(result.providerKey).toBe("local");
    expect(result.exitCode).toBe(0);
  });
});
