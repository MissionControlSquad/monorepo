import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { agentCache } from "../../src/server/cache";
import { createSecret } from "../../src/server/services/secrets";
import { runTaskInSandbox } from "../../src/server/services/sandbox-run";

// Provider 1 (E2B) through the sandbox execution seam. The e2b SDK is mocked; the vault resolution,
// the seam's provision→materialise→exec→destroy, and the BYO credential flow all run for real. Proves:
// the workspace's own E2B_API_KEY reaches Sandbox.create, the seam's script (incl. TASK.md) reaches
// commands.run, output flows back, and the sandbox is always killed.
const WS = "ws_e2b";

const { createMock, runMock, killMock, setTimeoutMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  runMock: vi.fn(),
  killMock: vi.fn(),
  setTimeoutMock: vi.fn(),
}));

vi.mock("e2b", () => ({
  Sandbox: { create: createMock },
  CommandExitError: class CommandExitError extends Error {},
  TimeoutError: class TimeoutError extends Error {},
}));

async function makeAgent(): Promise<string> {
  const agent = await prisma.agent.create({
    data: {
      name: "E2B Agent",
      role: "worker",
      personality: "diligent",
      workspaceId: WS,
      setupStatus: "active",
      apiKeyHash: hashApiKey(`mc_e2b_${Math.random()}`),
      runtimeAdapter: "shell",
      runtimeTemplate: "echo E2B_RAN && cat TASK.md",
      sandboxProvider: "e2b",
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
  process.env.SYSTEM_SECRET = "e2b-secret";
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
  // A provisioned sandbox whose commands.run echoes a marker + whether the seam's script reached it.
  setTimeoutMock.mockResolvedValue(undefined);
  killMock.mockResolvedValue(undefined);
  runMock.mockImplementation(async (cmd: string) => ({
    exitCode: 0,
    stdout: `E2B_EXEC ${/cat TASK\.md/.test(cmd) ? "HAS_TASK_MD" : ""}`,
    stderr: "",
  }));
  createMock.mockImplementation(async () => ({
    sandboxId: "sbx_e2b_123",
    setTimeout: setTimeoutMock,
    commands: { run: runMock },
    kill: killMock,
  }));
});

describe("E2B sandbox provider (through the seam)", () => {
  it("runs a task in E2B using the workspace's own key and returns output", async () => {
    await createSecret({
      workspaceId: WS,
      name: "E2B_API_KEY",
      value: "e2b_vault_key",
      createdBy: "h",
    });
    const agentId = await makeAgent();
    const taskId = await makeTask();

    const result = await runTaskInSandbox({ workspaceId: WS, taskId, agentId });

    expect(result.providerKey).toBe("e2b");
    expect(result.sandboxId).toBe("sbx_e2b_123");
    expect(result.exitCode).toBe(0);
    // The customer's OWN vault key reached the SDK — BYO, no operator env.
    expect(createMock).toHaveBeenCalledWith(
      "base",
      expect.objectContaining({ apiKey: "e2b_vault_key" }),
    );
    // The seam's materialised script (which reads TASK.md) reached the sandbox exec…
    expect(result.stdout).toContain("E2B_EXEC");
    expect(result.stdout).toContain("HAS_TASK_MD");
    // …and the sandbox was always torn down.
    expect(killMock).toHaveBeenCalledTimes(1);
  });

  it("fails clearly (no SDK call) when the workspace has no E2B_API_KEY", async () => {
    const agentId = await makeAgent();
    const taskId = await makeTask();
    await expect(runTaskInSandbox({ workspaceId: WS, taskId, agentId })).rejects.toThrow(
      /not configured|E2B_API_KEY|vault/i,
    );
    expect(createMock).not.toHaveBeenCalled();
  });
});
