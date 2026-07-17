import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { agentCache } from "../../src/server/cache";
import { runTaskInSandbox } from "../../src/server/services/sandbox-run";

// Tier D: the sandbox EXECUTION SEAM. Exercised end-to-end against the REAL `local` provider (temp
// dir + child_process, no keys) — proving provision → materialise the task → run the runtime → capture
// → destroy actually works. Cloud providers reuse this exact seam (their SDK is mocked in their tests).
const WS = "ws_sbxrun";

async function makeAgent(sandboxProvider?: string): Promise<string> {
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

beforeAll(() => {
  process.env.SYSTEM_SECRET = "sbxrun-secret";
});
beforeEach(async () => {
  agentCache.clear();
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE tasks, agent_skills, skills, agent_instructions, agents, profiles CASCADE`,
  );
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

  it("scopes the agent to the workspace (foreign agent → not found)", async () => {
    const agentId = await makeAgent("local");
    const taskId = await makeTask();
    await expect(runTaskInSandbox({ workspaceId: "ws_other", taskId, agentId })).rejects.toThrow(
      /Agent not found/i,
    );
  });
});
