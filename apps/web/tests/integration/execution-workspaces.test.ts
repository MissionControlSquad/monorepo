import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import {
  createProjectWorkspace,
  listProjectWorkspaces,
} from "../../src/server/services/execution-workspaces";
import { runTaskInSandbox, composeSandboxScript } from "../../src/server/services/sandbox-run";
import { getOrCreateAgentProfileId } from "../../src/server/agent-profile";

const WS = "ws_exws";

async function enableFlag(key: string) {
  await prisma.featureFlag.upsert({
    where: { key },
    create: { key, enabled: true, managedBy: "user" },
    update: { enabled: true },
  });
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = "exws-secret";
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE workspace_operations, execution_workspaces, project_workspaces, environments, agent_runs, messages, tasks, agents, profiles, projects CASCADE`,
  );
  await enableFlag("runners");
  await enableFlag("execution_workspaces");
  invalidateFlagCache();
});

describe("composeSandboxScript setup command (Plan 3)", () => {
  it("runs the setup command after clone and before the runtime", () => {
    const s = composeSandboxScript({
      prompt: "x",
      repoUrl: "https://github.com/acme/r.git",
      runtimeCmd: "codex exec",
      setupCommand: "npm ci",
    });
    expect(s).toContain("npm ci");
    // ordering: clone … TASK.md … npm ci … codex exec
    expect(s.indexOf("git clone")).toBeLessThan(s.indexOf("npm ci"));
    expect(s.indexOf("npm ci")).toBeLessThan(s.indexOf("codex exec"));
  });
});

describe("ProjectWorkspace CRUD", () => {
  it("creates + lists a project workspace; primary sorts first", async () => {
    await createProjectWorkspace(WS, { projectId: "p1", name: "extra" });
    await createProjectWorkspace(WS, { projectId: "p1", name: "main", isPrimary: true });
    const list = await listProjectWorkspaces(WS, "p1");
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe("main"); // primary first
  });

  it("rejects a duplicate name for the same project", async () => {
    await createProjectWorkspace(WS, { projectId: "p1", name: "dup" });
    await expect(createProjectWorkspace(WS, { projectId: "p1", name: "dup" })).rejects.toThrow(
      /already exists/i,
    );
  });

  it("rejects an unknown default strategy", async () => {
    await expect(
      createProjectWorkspace(WS, { projectId: "p1", name: "x", defaultStrategy: "bogus" }),
    ).rejects.toThrow(/Unknown workspace strategy/i);
  });
});

describe("per-run execution-workspace recording", () => {
  it("records an ExecutionWorkspace + operations for a run in a project (setup command runs)", async () => {
    // A project the task belongs to (no repo → no clone; setup still runs).
    const project = await prisma.project.create({
      data: { name: "Proj", workspaceId: WS },
    });
    await createProjectWorkspace(WS, {
      projectId: project.id,
      name: "main",
      isPrimary: true,
      setupCommand: "echo SETUP_RAN",
    });
    const task = await prisma.task.create({
      data: {
        title: "t",
        description: "d",
        status: "assigned",
        priority: "high",
        tags: [],
        projectId: project.id,
      },
    });
    const agent = await prisma.agent.create({
      data: {
        name: "A",
        role: "worker",
        personality: "x",
        workspaceId: WS,
        setupStatus: "active",
        apiKeyHash: hashApiKey(`mc_exws_${Math.random()}`),
        runtimeAdapter: "shell",
        runtimeTemplate: "echo DONE",
        sandboxProvider: "local",
      },
    });
    // The agent must be a member of the project to run its task.
    const profileId = await getOrCreateAgentProfileId(agent.id);
    await prisma.projectMember.create({
      data: { projectId: project.id, profileId, status: "active" },
    });

    const result = await runTaskInSandbox({ workspaceId: WS, taskId: task.id, agentId: agent.id });
    expect(result.stdout).toContain("SETUP_RAN"); // the project setup command executed
    expect(result.stdout).toContain("DONE");

    const ews = await prisma.executionWorkspace.findMany({
      where: { runId: result.runId },
      include: { operations: true },
    });
    expect(ews).toHaveLength(1);
    const ew = ews[0];
    expect(ew.strategyType).toBe("cloud_sandbox"); // sandbox provider → cloud_sandbox
    expect(ew.providerType).toBe("local");
    expect(ew.projectId).toBe(project.id);
    const phases = ew.operations.map((o) => o.phase).sort();
    expect(phases).toContain("setup");
    expect(phases).toContain("run");
  });

  it("records nothing when EXECUTION_WORKSPACES is off", async () => {
    await prisma.featureFlag.update({
      where: { key: "execution_workspaces" },
      data: { enabled: false },
    });
    invalidateFlagCache();
    const task = await prisma.task.create({
      data: { title: "t", description: "d", status: "assigned", priority: "high", tags: [] },
    });
    const agent = await prisma.agent.create({
      data: {
        name: "A",
        role: "worker",
        personality: "x",
        workspaceId: WS,
        setupStatus: "active",
        apiKeyHash: hashApiKey(`mc_exws2_${Math.random()}`),
        runtimeAdapter: "shell",
        runtimeTemplate: "echo DONE",
        sandboxProvider: "local",
      },
    });
    const result = await runTaskInSandbox({ workspaceId: WS, taskId: task.id, agentId: agent.id });
    expect(await prisma.executionWorkspace.count({ where: { runId: result.runId } })).toBe(0);
  });
});
