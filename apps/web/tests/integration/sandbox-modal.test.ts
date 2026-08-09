import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { agentCache } from "../../src/server/cache";
import { createSecret } from "../../src/server/services/secrets";
import { runTaskInSandbox } from "../../src/server/services/sandbox-run";

// Provider 3 (Modal) through the seam. SDK (gRPC) mocked. Two-key auth (MODAL_TOKEN_ID + SECRET).
const WS = "ws_modal";

const { ctorMock, fromNameMock, fromRegistryMock, createMock, execMock, terminateMock, closeMock } =
  vi.hoisted(() => ({
    ctorMock: vi.fn(),
    fromNameMock: vi.fn(),
    fromRegistryMock: vi.fn(),
    createMock: vi.fn(),
    execMock: vi.fn(),
    terminateMock: vi.fn(),
    closeMock: vi.fn(),
  }));

vi.mock("modal", () => ({
  ModalClient: class {
    apps = { fromName: fromNameMock };
    images = { fromRegistry: fromRegistryMock };
    sandboxes = { create: createMock };
    close = closeMock;
    constructor(opts: unknown) {
      ctorMock(opts);
    }
  },
}));

async function makeAgent(): Promise<string> {
  const agent = await prisma.agent.create({
    data: {
      name: "Modal Agent",
      role: "worker",
      personality: "diligent",
      workspaceId: WS,
      setupStatus: "active",
      apiKeyHash: hashApiKey(`mc_modal_${Math.random()}`),
      runtimeAdapter: "shell",
      runtimeTemplate: "echo M_RAN && cat TASK.md",
      sandboxProvider: "modal",
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
  process.env.SYSTEM_SECRET = "modal-secret";
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
  fromNameMock.mockResolvedValue({});
  fromRegistryMock.mockReturnValue({});
  terminateMock.mockResolvedValue(undefined);
  closeMock.mockResolvedValue(undefined);
  execMock.mockImplementation(async (argv: string[]) => {
    const script = argv[2] ?? "";
    return {
      stdout: {
        readText: async () => `MODAL_EXEC ${/cat TASK\.md/.test(script) ? "HAS_TASK_MD" : ""}`,
      },
      stderr: { readText: async () => "" },
      wait: async () => 0,
    };
  });
  createMock.mockImplementation(async () => ({
    sandboxId: "sbx_modal_1",
    exec: execMock,
    terminate: terminateMock,
  }));
});

async function seedTokens() {
  await createSecret({ workspaceId: WS, name: "MODAL_TOKEN_ID", value: "tid", createdBy: "h" });
  await createSecret({
    workspaceId: WS,
    name: "MODAL_TOKEN_SECRET",
    value: "tsec",
    createdBy: "h",
  });
}

describe("Modal sandbox provider (through the seam)", () => {
  it("runs a task in Modal using the workspace's own token pair and returns output", async () => {
    await seedTokens();
    const agentId = await makeAgent();
    const taskId = await makeTask();

    const result = await runTaskInSandbox({ workspaceId: WS, taskId, agentId });

    expect(result.providerKey).toBe("modal");
    expect(result.sandboxId).toBe("sbx_modal_1");
    expect(result.exitCode).toBe(0);
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({ tokenId: "tid", tokenSecret: "tsec" }),
    );
    expect(result.stdout).toContain("MODAL_EXEC");
    expect(result.stdout).toContain("HAS_TASK_MD");
    expect(terminateMock).toHaveBeenCalledTimes(1);
  });

  it("requires BOTH tokens — one alone → no SDK call", async () => {
    await createSecret({ workspaceId: WS, name: "MODAL_TOKEN_ID", value: "tid", createdBy: "h" });
    const agentId = await makeAgent();
    const taskId = await makeTask();
    await expect(runTaskInSandbox({ workspaceId: WS, taskId, agentId })).rejects.toThrow(
      /not configured|MODAL_TOKEN_SECRET|vault/i,
    );
    expect(ctorMock).not.toHaveBeenCalled();
  });
});
