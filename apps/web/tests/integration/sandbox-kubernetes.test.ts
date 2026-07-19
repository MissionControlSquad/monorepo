import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { agentCache } from "../../src/server/cache";
import { createSecret } from "../../src/server/services/secrets";
import { runTaskInSandbox } from "../../src/server/services/sandbox-run";

// Provider 6 (Kubernetes) through the seam. @kubernetes/client-node mocked: create pod → Exec over
// (fake) streams + status callback → delete pod. Kubeconfig loaded from the workspace's KUBECONFIG.
const WS = "ws_k8s";

const { loadFromStringMock, createPodMock, readPodMock, deletePodMock, execMock } = vi.hoisted(
  () => ({
    loadFromStringMock: vi.fn(),
    createPodMock: vi.fn(),
    readPodMock: vi.fn(),
    deletePodMock: vi.fn(),
    execMock: vi.fn(),
  }),
);

vi.mock("@kubernetes/client-node", () => {
  const coreApi = {
    createNamespacedPod: createPodMock,
    readNamespacedPod: readPodMock,
    deleteNamespacedPod: deletePodMock,
  };
  return {
    KubeConfig: class {
      loadFromString = loadFromStringMock;
      loadFromFile = vi.fn();
      makeApiClient = () => coreApi;
    },
    CoreV1Api: class {},
    Exec: class {
      exec = execMock;
    },
  };
});

async function makeAgent(): Promise<string> {
  const agent = await prisma.agent.create({
    data: {
      name: "K8s Agent",
      role: "worker",
      personality: "diligent",
      workspaceId: WS,
      setupStatus: "active",
      apiKeyHash: hashApiKey(`mc_k8s_${Math.random()}`),
      runtimeAdapter: "shell",
      runtimeTemplate: "echo K8S_RAN && cat TASK.md",
      sandboxProvider: "kubernetes",
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
  process.env.SYSTEM_SECRET = "k8s-secret";
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
  createPodMock.mockResolvedValue({});
  readPodMock.mockResolvedValue({ status: { phase: "Running" } });
  deletePodMock.mockResolvedValue({});
  // The Exec class: stream stdout, end both streams, and report Success so execInPod resolves.
  execMock.mockImplementation(
    async (
      _ns: string,
      _pod: string,
      _container: string,
      command: string[],
      stdout: NodeJS.WritableStream,
      stderr: NodeJS.WritableStream,
      _stdin: unknown,
      _tty: boolean,
      statusCb: (s: { status: string }) => void,
    ) => {
      const script = command[2] ?? "";
      stdout.write(`K8S_EXEC ${/cat TASK\.md/.test(script) ? "HAS_TASK_MD" : ""}`);
      (stdout as unknown as { end: () => void }).end();
      (stderr as unknown as { end: () => void }).end();
      statusCb({ status: "Success" });
      return {};
    },
  );
});

const KUBECONFIG_YAML = "apiVersion: v1\nclusters: []\ncontexts: []\nusers: []";

describe("Kubernetes sandbox provider (through the seam)", () => {
  it("runs a task in a k8s pod using the workspace's KUBECONFIG and returns output", async () => {
    await createSecret({
      workspaceId: WS,
      name: "KUBECONFIG",
      value: KUBECONFIG_YAML,
      createdBy: "h",
    });
    const agentId = await makeAgent();
    const taskId = await makeTask();

    const result = await runTaskInSandbox({ workspaceId: WS, taskId, agentId });

    expect(result.providerKey).toBe("kubernetes");
    expect(result.exitCode).toBe(0);
    // The workspace's own kubeconfig was loaded, a pod was created, exec ran, pod deleted.
    expect(loadFromStringMock).toHaveBeenCalledWith(KUBECONFIG_YAML);
    expect(createPodMock).toHaveBeenCalledTimes(1);
    expect(result.stdout).toContain("K8S_EXEC");
    expect(result.stdout).toContain("HAS_TASK_MD");
    expect(deletePodMock).toHaveBeenCalledTimes(1);
  });

  it("fails clearly (no k8s call) when the workspace has no KUBECONFIG", async () => {
    const agentId = await makeAgent();
    const taskId = await makeTask();
    await expect(runTaskInSandbox({ workspaceId: WS, taskId, agentId })).rejects.toThrow(
      /not configured|KUBECONFIG|vault/i,
    );
    expect(createPodMock).not.toHaveBeenCalled();
  });
});
