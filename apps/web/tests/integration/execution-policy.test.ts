import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { invalidateFlagCache, setTestFeature } from "../../src/server/feature-flags";
import {
  evaluateExecutionAllowlist,
  getWorkspaceExecutionPolicy,
  setWorkspaceExecutionMode,
  assertExecutionAllowed,
} from "../../src/server/services/execution-policy";
import { runTaskInSandbox } from "../../src/server/services/sandbox-run";
import { probeEnvironment, createEnvironment } from "../../src/server/services/environments";

const WS = "ws_execpol";

async function enableFlag(key: string) {
  setTestFeature(key, true);
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = "execpol-secret";
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE workspace_execution_policies, environments, agent_runs, agents, tasks CASCADE`,
  );
  await enableFlag("runners");
  await enableFlag("environments");
  await enableFlag("execution_policy");
  invalidateFlagCache();
});

describe("execution allowlist (pure)", () => {
  it("permits everything under `any`", () => {
    const p = { executionMode: "any" as const, enableIsolatedWorkspaces: false };
    expect(evaluateExecutionAllowlist(p, { driver: "local" }).allowed).toBe(true);
    expect(evaluateExecutionAllowlist(p, { driver: "ssh" }).allowed).toBe(true);
    expect(evaluateExecutionAllowlist(p, { driver: "sandbox", provider: "e2b" }).allowed).toBe(
      true,
    );
  });

  it("under `kubernetes`, only the kubernetes sandbox provider is allowed", () => {
    const p = { executionMode: "kubernetes" as const, enableIsolatedWorkspaces: true };
    expect(evaluateExecutionAllowlist(p, { driver: "local" }).allowed).toBe(false);
    expect(evaluateExecutionAllowlist(p, { driver: "ssh" }).allowed).toBe(false);
    expect(evaluateExecutionAllowlist(p, { driver: "sandbox", provider: "e2b" }).allowed).toBe(
      false,
    );
    expect(
      evaluateExecutionAllowlist(p, { driver: "sandbox", provider: "kubernetes" }).allowed,
    ).toBe(true);
  });
});

describe("workspace execution policy persistence", () => {
  it("defaults to `any` and round-trips a set", async () => {
    expect(await getWorkspaceExecutionPolicy(WS)).toMatchObject({ executionMode: "any" });
    await setWorkspaceExecutionMode(WS, {
      executionMode: "kubernetes",
      enableIsolatedWorkspaces: true,
    });
    expect(await getWorkspaceExecutionPolicy(WS)).toMatchObject({
      executionMode: "kubernetes",
      enableIsolatedWorkspaces: true,
    });
  });

  it("rejects an unknown execution mode", async () => {
    await expect(
      setWorkspaceExecutionMode(WS, { executionMode: "docker" as never }),
    ).rejects.toThrow(/Unknown execution mode/i);
  });

  it("assertExecutionAllowed throws for a denied target, passes for an allowed one", async () => {
    await setWorkspaceExecutionMode(WS, { executionMode: "kubernetes" });
    await expect(
      assertExecutionAllowed(WS, { driver: "sandbox", provider: "local" }),
    ).rejects.toThrow(/kubernetes/i);
    await expect(
      assertExecutionAllowed(WS, { driver: "sandbox", provider: "kubernetes" }),
    ).resolves.toBeUndefined();
  });
});

describe("allowlist enforcement in runTaskInSandbox", () => {
  it("blocks a local sandbox run when the workspace forces kubernetes (before provisioning)", async () => {
    await setWorkspaceExecutionMode(WS, { executionMode: "kubernetes" });
    const agent = await prisma.agent.create({
      data: {
        name: "A",
        role: "worker",
        personality: "x",
        workspaceId: WS,
        setupStatus: "active",
        apiKeyHash: hashApiKey(`mc_ep_${Math.random()}`),
        runtimeAdapter: "shell",
        runtimeTemplate: "echo hi",
        sandboxProvider: "local",
      },
    });
    const task = await prisma.task.create({
      data: { title: "t", description: "d", status: "assigned", priority: "high", tags: [] },
    });
    await expect(
      runTaskInSandbox({ workspaceId: WS, taskId: task.id, agentId: agent.id }),
    ).rejects.toThrow(/kubernetes/i);
    // nothing ran
    expect(await prisma.agentRun.count({ where: { agentId: agent.id, status: "done" } })).toBe(0);
  });
});

describe("environment probe", () => {
  it("probes a local env as reachable", async () => {
    const env = await createEnvironment(WS, { name: "L", driver: "local" });
    const res = await probeEnvironment(WS, env.id);
    expect(res).toMatchObject({ ok: true, driver: "local" });
  });

  it("probes a local sandbox env end-to-end (provision → echo → destroy)", async () => {
    const env = await createEnvironment(WS, {
      name: "Sbx",
      driver: "sandbox",
      config: { provider: "local" },
    });
    const res = await probeEnvironment(WS, env.id);
    expect(res.ok).toBe(true);
    expect(res.summary).toMatch(/ran a command/i);
  });

  it("reports an ssh env with no key as not ok (never connects)", async () => {
    const env = await createEnvironment(WS, {
      name: "SSH",
      driver: "ssh",
      config: { host: "1.2.3.4" },
    });
    const res = await probeEnvironment(WS, env.id);
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/private key/i);
  });
});
