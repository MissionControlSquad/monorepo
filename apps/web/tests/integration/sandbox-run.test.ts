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
import { promoteAgentRunReview } from "../../src/server/services/run-review";
import {
  scheduleRunRetryIfTransient,
  promoteDueRunRetries,
} from "../../src/server/services/run-retry";
import { reconcileStrandedWork } from "../../src/server/services/stranded-work";
import { armTaskMonitor, tickDueTaskMonitors } from "../../src/server/services/task-monitors";
import { createEnvironment } from "../../src/server/services/environments";
import { getRunRuntimeStatus } from "../../src/server/services/run-runtime-status";
import { createSecret, bindSecret } from "../../src/server/services/secrets";

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
    `TRUNCATE TABLE agent_runs, messages, tasks, agent_skills, skills, agent_instructions, agents, profiles, environments, secrets CASCADE`,
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

  it("streams a redacted live tail into the run runtime status (Plan 6)", async () => {
    // The agent's runtime echoes a marker AND a value we bind as a secret — the secret must be redacted.
    const agent = await prisma.agent.create({
      data: {
        name: "Streamer",
        role: "worker",
        personality: "x",
        workspaceId: WS,
        setupStatus: "active",
        apiKeyHash: hashApiKey(`mc_stream_${Math.random()}`),
        runtimeAdapter: "shell",
        runtimeTemplate: "echo LIVE_MARKER && echo secret=$MY_SECRET",
        sandboxProvider: "local",
      },
    });
    // Bind MY_SECRET into the agent's env so it is exported into the box + registered for redaction.
    const secret = await createSecret({
      workspaceId: WS,
      name: "MY_SECRET",
      value: "sk-streamed-secret",
      createdBy: "h",
    });
    await bindSecret({
      workspaceId: WS,
      secretId: secret.id,
      scope: "agent",
      agentId: agent.id,
      envVarName: "MY_SECRET",
      createdBy: "h",
    });
    const taskId = await makeTask();

    const result = await runTaskInSandbox({ workspaceId: WS, taskId, agentId: agent.id });
    const live = getRunRuntimeStatus(result.runId);
    expect(live).not.toBeNull();
    expect(live!.phase).toBe("done");
    expect(live!.tail).toContain("LIVE_MARKER"); // streamed output captured
    expect(live!.tail).not.toContain("sk-streamed-secret"); // secret value scrubbed
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

  it("rejects an ssh/plugin Environment when ENVIRONMENTS is off (not yet runnable via the seam)", async () => {
    // Back-compat: with the ENVIRONMENTS flag dark, the ssh runtime driver stays disabled and an ssh env
    // is refused up front (the unified driver only routes ssh when ENVIRONMENTS is enabled).
    await prisma.featureFlag.upsert({
      where: { key: "environments" },
      create: { key: "environments", enabled: false, managedBy: "user" },
      update: { enabled: false },
    });
    invalidateFlagCache();
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

describe("untrusted-output review gate (Domain 8 G2)", () => {
  async function enableLowTrustReview(on = true) {
    await prisma.featureFlag.upsert({
      where: { key: "low_trust_review" },
      create: { key: "low_trust_review", enabled: on, managedBy: "user" },
      update: { enabled: on },
    });
    invalidateFlagCache();
  }

  it("stamps needs_review + quarantined sourceTrust for a review-required agent (flag on)", async () => {
    await enableLowTrustReview();
    // A STANDARD-trust agent (so it may run on `local`) whose profile requires untrusted-PR review.
    const agentId = await makeAgent("local", "standard");
    await prisma.agentTrustProfile.create({
      data: { agentId, workspaceId: WS, trustLevel: "standard", requireUntrustedPrReview: true },
    });
    const taskId = await makeTask();
    const result = await runTaskInSandbox({ workspaceId: WS, taskId, agentId });
    expect(result.exitCode).toBe(0);

    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: result.runId } });
    expect(run.reviewState).toBe("needs_review");
    expect(run.sourceTrust).toMatchObject({
      preset: "low_trust_review",
      disposition: "quarantined",
    });
  });

  it("stamps approved for a standard agent, and is a no-op when the flag is off", async () => {
    // flag ON, plain standard agent → approved
    await enableLowTrustReview();
    const trusted = await makeAgent("local", "standard");
    const t1 = await makeTask();
    const r1 = await runTaskInSandbox({ workspaceId: WS, taskId: t1, agentId: trusted });
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: r1.runId } })).reviewState).toBe(
      "approved",
    );

    // flag OFF → not evaluated at all (reviewState stays null)
    await enableLowTrustReview(false);
    const agentId = await makeAgent("local", "standard");
    await prisma.agentTrustProfile.create({
      data: { agentId, workspaceId: WS, trustLevel: "standard", requireUntrustedPrReview: true },
    });
    const t2 = await makeTask();
    const r2 = await runTaskInSandbox({ workspaceId: WS, taskId: t2, agentId });
    expect(
      (await prisma.agentRun.findUniqueOrThrow({ where: { id: r2.runId } })).reviewState,
    ).toBeNull();
  });

  it("promoteAgentRunReview flips a quarantined run to approved (only from needs_review)", async () => {
    await enableLowTrustReview();
    const agentId = await makeAgent("local", "standard");
    await prisma.agentTrustProfile.create({
      data: { agentId, workspaceId: WS, trustLevel: "standard", requireUntrustedPrReview: true },
    });
    const taskId = await makeTask();
    const { runId } = await runTaskInSandbox({ workspaceId: WS, taskId, agentId });

    const promoted = await promoteAgentRunReview({
      workspaceId: WS,
      runId,
      decision: "approved",
      reviewedByProfileId: "profile_board",
    });
    expect(promoted.reviewState).toBe("approved");
    expect(promoted.sourceTrust).toMatchObject({
      disposition: "trusted",
      promotedByProfileId: "profile_board",
    });
    expect(promoted.reviewedByProfileId).toBe("profile_board");

    // a run not awaiting review can't be promoted
    await expect(
      promoteAgentRunReview({
        workspaceId: WS,
        runId,
        decision: "approved",
        reviewedByProfileId: "profile_board",
      }),
    ).rejects.toThrow(/awaiting review/);
  });
});

describe("scheduled run retries (Domain 9 #6)", () => {
  it("schedules a retry for a transient timeout, then promotes it to a fresh queued run", async () => {
    const agentId = await makeAgent("local");
    const taskId = await makeTask();
    // A timed-out source run under the retry cap.
    const source = await prisma.agentRun.create({
      data: {
        workspaceId: WS,
        agentId,
        taskId,
        kind: "sandbox",
        providerKey: "local",
        status: "timeout",
        retryCount: 0,
      },
    });

    const now = new Date("2026-07-19T12:00:00Z");
    const at = await scheduleRunRetryIfTransient(
      { id: source.id, status: "timeout", retryCount: 0 },
      now,
    );
    expect(at).not.toBeNull();
    const scheduled = await prisma.agentRun.findUniqueOrThrow({ where: { id: source.id } });
    expect(scheduled.scheduledRetryAt?.toISOString()).toBe(at!.toISOString());
    expect(scheduled.retryReason).toBe("timeout");

    // Not yet due → nothing promoted.
    expect(await promoteDueRunRetries(new Date(at!.getTime() - 1000))).toBe(0);

    // Due → one fresh queued run for the same agent/task, retryCount+1, linked to the source.
    expect(await promoteDueRunRetries(new Date(at!.getTime() + 1000))).toBe(1);
    const retry = await prisma.agentRun.findFirstOrThrow({
      where: { retryOfRunId: source.id },
    });
    expect(retry).toMatchObject({
      status: "queued",
      agentId,
      taskId,
      retryCount: 1,
      providerKey: "local",
    });
    // source schedule cleared → a second tick does not double-promote
    expect(await promoteDueRunRetries(new Date(at!.getTime() + 2000))).toBe(0);
  });

  it("does not schedule a retry for a clean failure or an exhausted budget", async () => {
    const agentId = await makeAgent("local");
    const taskId = await makeTask();
    // clean failure → no retry
    const failed = await prisma.agentRun.create({
      data: { workspaceId: WS, agentId, taskId, kind: "sandbox", status: "failed", retryCount: 0 },
    });
    expect(
      await scheduleRunRetryIfTransient({ id: failed.id, status: "failed", retryCount: 0 }),
    ).toBeNull();
    // exhausted budget → no retry even for a timeout
    const exhausted = await prisma.agentRun.create({
      data: { workspaceId: WS, agentId, taskId, kind: "sandbox", status: "timeout", retryCount: 4 },
    });
    expect(
      await scheduleRunRetryIfTransient({ id: exhausted.id, status: "timeout", retryCount: 4 }),
    ).toBeNull();
  });
});

describe("stranded-work reconciliation (Domain 9 #8)", () => {
  async function failedRun(agentId: string, taskId: string) {
    return prisma.agentRun.create({
      data: {
        workspaceId: WS,
        agentId,
        taskId,
        kind: "sandbox",
        providerKey: "local",
        status: "failed",
        scheduledRetryAt: null,
      },
    });
  }
  // Move a task to an actionable status (makeTask creates it 'assigned' already).
  async function assignedTask() {
    return makeTask();
  }

  it("re-dispatches a stranded task once (owner-preserving), then escalates to blocked", async () => {
    const agentId = await makeAgent("local");
    const taskId = await assignedTask();
    await failedRun(agentId, taskId);

    // First reconcile → one re-dispatch (a fresh queued run) + a recovery action.
    const r1 = await reconcileStrandedWork(new Date());
    expect(r1.redispatched).toBe(1);
    expect(r1.escalated).toBe(0);
    const queued = await prisma.agentRun.findFirst({
      where: { taskId, status: "queued" },
    });
    expect(queued).not.toBeNull();
    expect(
      await prisma.taskRecoveryAction.count({ where: { taskId, reason: "stranded_work" } }),
    ).toBe(1);

    // While a queued run exists, the task is in-flight → a second reconcile is a no-op.
    const r2 = await reconcileStrandedWork(new Date());
    expect(r2).toMatchObject({ redispatched: 0, escalated: 0 });

    // The re-dispatch also fails (simulate): mark the queued run failed, then reconcile → escalate.
    await prisma.agentRun.update({ where: { id: queued!.id }, data: { status: "failed" } });
    const r3 = await reconcileStrandedWork(new Date());
    expect(r3.escalated).toBe(1);
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.status).toBe("blocked");
    // a blocked task drops out → no further recovery
    expect(await reconcileStrandedWork(new Date())).toMatchObject({
      redispatched: 0,
      escalated: 0,
    });
  });

  it("ignores a run pending a scheduled retry (the retry system owns it)", async () => {
    const agentId = await makeAgent("local");
    const taskId = await assignedTask();
    await prisma.agentRun.create({
      data: {
        workspaceId: WS,
        agentId,
        taskId,
        kind: "sandbox",
        providerKey: "local",
        status: "timeout",
        scheduledRetryAt: new Date(Date.now() + 60_000), // retry pending
      },
    });
    expect(await reconcileStrandedWork(new Date())).toMatchObject({
      redispatched: 0,
      escalated: 0,
    });
  });

  it("ignores a non-sandbox agent (nothing to re-dispatch)", async () => {
    const agentId = await makeAgent(); // no sandboxProvider / environment
    const taskId = await assignedTask();
    await failedRun(agentId, taskId);
    expect(await reconcileStrandedWork(new Date())).toMatchObject({
      redispatched: 0,
      escalated: 0,
    });
  });
});

describe("issue monitors — one-shot deferred wake (Domain 9 #11)", () => {
  async function assignAgent(taskId: string, agentId: string) {
    const profileId = await getOrCreateAgentProfileId(agentId);
    await prisma.taskAssignee.create({ data: { taskId, profileId } });
  }

  it("arms then fires a due monitor: re-dispatches the assignee + clears the one-shot schedule", async () => {
    const agentId = await makeAgent("local");
    const taskId = await makeTask();
    await assignAgent(taskId, agentId);

    await armTaskMonitor({
      taskId,
      nextCheckAt: new Date("2026-07-19T12:00:00Z"),
      notes: "poll deploy",
    });

    // not due yet → nothing fires, schedule intact
    expect(await tickDueTaskMonitors(new Date("2026-07-19T11:59:00Z"))).toBe(0);
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).monitorNextCheckAt,
    ).not.toBeNull();

    // due → one dispatch, schedule cleared (one-shot), attempt counted
    expect(await tickDueTaskMonitors(new Date("2026-07-19T12:01:00Z"))).toBe(1);
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.monitorNextCheckAt).toBeNull();
    expect(task.monitorAttemptCount).toBe(1);
    expect(await prisma.agentRun.count({ where: { taskId, status: "queued" } })).toBe(1);

    // one-shot: a second tick does nothing (must be re-armed)
    expect(await tickDueTaskMonitors(new Date("2026-07-19T12:05:00Z"))).toBe(0);
  });

  it("does not fire past maxAttempts (disarms without dispatching)", async () => {
    const agentId = await makeAgent("local");
    const taskId = await makeTask();
    await assignAgent(taskId, agentId);
    // already at the cap
    await armTaskMonitor({ taskId, nextCheckAt: new Date("2026-07-19T12:00:00Z"), maxAttempts: 1 });
    await prisma.task.update({ where: { id: taskId }, data: { monitorAttemptCount: 1 } });

    expect(await tickDueTaskMonitors(new Date("2026-07-19T12:01:00Z"))).toBe(0);
    expect(await prisma.agentRun.count({ where: { taskId } })).toBe(0);
    // schedule still cleared (consumed)
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).monitorNextCheckAt,
    ).toBeNull();
  });
});

describe("§3 #11 (1) — priority dispatch + per-agent maxConcurrentRuns", () => {
  /** A task with an explicit Priority (drives AgentRun.priority at enqueue). */
  async function makeTaskWithPriority(priority: "low" | "medium" | "high" | "urgent") {
    const task = await prisma.task.create({
      data: { title: `T ${priority}`, description: "d", status: "assigned", priority, tags: [] },
    });
    return task.id;
  }

  it("stamps AgentRun.priority from the task's Priority at enqueue", async () => {
    const agentId = await makeAgent("local");
    const low = await enqueueSandboxRun({
      workspaceId: WS,
      taskId: await makeTaskWithPriority("low"),
      agentId,
    });
    const urgent = await enqueueSandboxRun({
      workspaceId: WS,
      taskId: await makeTaskWithPriority("urgent"),
      agentId,
    });
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: low.runId } })).priority).toBe(
      0,
    );
    expect(
      (await prisma.agentRun.findUniqueOrThrow({ where: { id: urgent.runId } })).priority,
    ).toBe(3);
  });

  it("drains the highest-priority queued run first (priority DESC, then FIFO)", async () => {
    const agentId = await makeAgent("local");
    // Three distinct tasks for the same agent, enqueued low → urgent → high.
    await enqueueSandboxRun({
      workspaceId: WS,
      taskId: await makeTaskWithPriority("low"),
      agentId,
    });
    await enqueueSandboxRun({
      workspaceId: WS,
      taskId: await makeTaskWithPriority("urgent"),
      agentId,
    });
    await enqueueSandboxRun({
      workspaceId: WS,
      taskId: await makeTaskWithPriority("high"),
      agentId,
    });

    // Drain exactly one → only the URGENT run starts; the rest stay queued in priority order.
    const started = await drainSandboxRunQueue(1);
    expect(started).toBe(1);
    const runs = await prisma.agentRun.findMany({ where: { agentId } });
    expect(runs.find((r) => r.priority === 3)?.status).toBe("done"); // urgent ran
    expect(runs.find((r) => r.priority === 2)?.status).toBe("queued"); // high waits
    expect(runs.find((r) => r.priority === 0)?.status).toBe("queued"); // low waits
  });

  it("respects the per-agent maxConcurrentRuns cap (skips while at capacity, runs once free)", async () => {
    const agentId = await makeAgent("local");
    await prisma.agent.update({ where: { id: agentId }, data: { maxConcurrentRuns: 1 } });

    // Simulate one run already in-flight for this agent (as if on another worker).
    await prisma.agentRun.create({
      data: {
        workspaceId: WS,
        agentId,
        taskId: await makeTaskWithPriority("high"),
        kind: "sandbox",
        providerKey: "local",
        status: "running",
      },
    });

    const { runId } = await enqueueSandboxRun({
      workspaceId: WS,
      taskId: await makeTask(),
      agentId,
    });
    // At capacity (1 running ≥ cap 1) → the queued run is NOT started; it stays queued.
    expect(await drainSandboxRunQueue()).toBe(0);
    expect((await prisma.agentRun.findUnique({ where: { id: runId } }))?.status).toBe("queued");

    // Free the in-flight slot → now under cap → the queued run drains + completes.
    await prisma.agentRun.updateMany({
      where: { agentId, status: "running" },
      data: { status: "done", finishedAt: new Date() },
    });
    expect(await drainSandboxRunQueue()).toBeGreaterThanOrEqual(1);
    expect((await prisma.agentRun.findUnique({ where: { id: runId } }))?.status).toBe("done");
  });

  it("with no cap set, drains a run regardless of other in-flight runs (unlimited)", async () => {
    const agentId = await makeAgent("local"); // maxConcurrentRuns null = unlimited
    await prisma.agentRun.create({
      data: {
        workspaceId: WS,
        agentId,
        taskId: await makeTask(),
        kind: "sandbox",
        providerKey: "local",
        status: "running",
      },
    });
    const { runId } = await enqueueSandboxRun({
      workspaceId: WS,
      taskId: await makeTask(),
      agentId,
    });
    expect(await drainSandboxRunQueue()).toBeGreaterThanOrEqual(1);
    expect((await prisma.agentRun.findUnique({ where: { id: runId } }))?.status).toBe("done");
  });
});
