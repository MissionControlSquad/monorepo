import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { agentCache } from "../../src/server/cache";
import { createSecret } from "../../src/server/services/secrets";
import { runTaskInSandbox } from "../../src/server/services/sandbox-run";

// Provider 4 (Novita) through the seam. novita-sandbox SDK mocked.
const WS = "ws_novita";

const { createMock, runMock, killMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  runMock: vi.fn(),
  killMock: vi.fn(),
}));

vi.mock("novita-sandbox", () => ({ Sandbox: { create: createMock } }));

async function makeAgent(): Promise<string> {
  const agent = await prisma.agent.create({
    data: {
      name: "Novita Agent",
      role: "worker",
      personality: "diligent",
      workspaceId: WS,
      setupStatus: "active",
      apiKeyHash: hashApiKey(`mc_nv_${Math.random()}`),
      runtimeAdapter: "shell",
      runtimeTemplate: "echo NV_RAN && cat TASK.md",
      sandboxProvider: "novita",
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
  process.env.SYSTEM_SECRET = "nv-secret";
});
beforeEach(async () => {
  agentCache.clear();
  vi.clearAllMocks();
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE tasks, agent_skills, skills, agent_instructions, agents, profiles CASCADE`,
  );
  const ids = (
    await prisma.secret.findMany({ where: { workspaceId: WS }, select: { id: true } })
  ).map((s) => s.id);
  if (ids.length) {
    await prisma.secretVersion.deleteMany({ where: { secretId: { in: ids } } });
    await prisma.secretAccessEvent.deleteMany({ where: { secretId: { in: ids } } });
    await prisma.secret.deleteMany({ where: { id: { in: ids } } });
  }
  runMock.mockImplementation(async (cmd: string) => ({
    exitCode: 0,
    stdout: `NOVITA_EXEC ${/cat TASK\.md/.test(cmd) ? "HAS_TASK_MD" : ""}`,
    stderr: "",
  }));
  killMock.mockResolvedValue(undefined);
  createMock.mockImplementation(async () => ({
    sandboxId: "sbx_nv_1",
    commands: { run: runMock },
    kill: killMock,
  }));
});

describe("Novita sandbox provider (through the seam)", () => {
  it("runs a task in Novita using the workspace's own key and returns output", async () => {
    await createSecret({
      workspaceId: WS,
      name: "NOVITA_API_KEY",
      value: "nv_key",
      createdBy: "h",
    });
    const agentId = await makeAgent();
    const taskId = await makeTask();

    const result = await runTaskInSandbox({ workspaceId: WS, taskId, agentId });

    expect(result.providerKey).toBe("novita");
    expect(result.sandboxId).toBe("sbx_nv_1");
    expect(result.exitCode).toBe(0);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "nv_key" }));
    expect(result.stdout).toContain("NOVITA_EXEC");
    expect(result.stdout).toContain("HAS_TASK_MD");
    expect(killMock).toHaveBeenCalledTimes(1);
  });

  it("fails clearly (no SDK call) when the workspace has no NOVITA_API_KEY", async () => {
    const agentId = await makeAgent();
    const taskId = await makeTask();
    await expect(runTaskInSandbox({ workspaceId: WS, taskId, agentId })).rejects.toThrow(
      /not configured|NOVITA_API_KEY|vault/i,
    );
    expect(createMock).not.toHaveBeenCalled();
  });
});
