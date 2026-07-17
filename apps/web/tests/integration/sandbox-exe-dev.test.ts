import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { EventEmitter } from "node:events";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { agentCache } from "../../src/server/cache";
import { createSecret } from "../../src/server/services/secrets";
import { runTaskInSandbox } from "../../src/server/services/sandbox-run";

// Provider 7 (exe-dev) through the seam. No SDK: VM lifecycle over HTTP /exec (fetch mocked) + command
// execution over a local `ssh` subprocess (child_process.spawn mocked). Proves the workspace's own
// EXE_DEV_API_KEY provisions/destroys the VM and its SSH key runs the seam's script.
const WS = "ws_exedev";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("node:child_process", async (orig) => {
  const actual = await orig<typeof import("node:child_process")>();
  return { ...actual, spawn: spawnMock };
});

const realFetch = globalThis.fetch;
const fetchMock = vi.fn();

async function makeAgent(): Promise<string> {
  const agent = await prisma.agent.create({
    data: {
      name: "Exe Agent",
      role: "worker",
      personality: "diligent",
      workspaceId: WS,
      setupStatus: "active",
      apiKeyHash: hashApiKey(`mc_exe_${Math.random()}`),
      runtimeAdapter: "shell",
      runtimeTemplate: "echo EXE_RAN && cat TASK.md",
      sandboxProvider: "exe-dev",
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
  process.env.SYSTEM_SECRET = "exe-secret";
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
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
  // HTTP lifecycle: `new` → a VM record; `rm` → ok.
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    const payload = body.startsWith("new")
      ? { name: "agentcenter-x", ssh_dest: "x.exe.xyz" }
      : { ok: true };
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
  });
  // ssh subprocess: emit the marker + whether the seam's script reached the remote command, then close.
  spawnMock.mockImplementation((_cmd: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: () => void;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    const remote = String(args[args.length - 1] ?? "");
    setImmediate(() => {
      child.stdout.emit(
        "data",
        Buffer.from(`EXE_EXEC ${/cat TASK\.md/.test(remote) ? "HAS_TASK_MD" : ""}`),
      );
      child.emit("close", 0);
    });
    return child;
  });
});

describe("exe-dev sandbox provider (through the seam)", () => {
  it("provisions over HTTP, runs the task over SSH, and tears the VM down", async () => {
    await createSecret({
      workspaceId: WS,
      name: "EXE_DEV_API_KEY",
      value: "exe_key",
      createdBy: "h",
    });
    await createSecret({
      workspaceId: WS,
      name: "EXE_DEV_SSH_KEY",
      value: "-----BEGIN KEY-----\nabc\n-----END KEY-----",
      createdBy: "h",
    });
    const agentId = await makeAgent();
    const taskId = await makeTask();

    const result = await runTaskInSandbox({ workspaceId: WS, taskId, agentId });

    expect(result.providerKey).toBe("exe-dev");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("EXE_EXEC");
    expect(result.stdout).toContain("HAS_TASK_MD");
    // ssh was used to run it…
    expect(spawnMock).toHaveBeenCalledWith("ssh", expect.any(Array));
    // …and the HTTP lifecycle provisioned (new) + destroyed (rm) using the workspace's own token.
    const bodies = fetchMock.mock.calls.map((c) => String((c[1] as RequestInit)?.body ?? ""));
    expect(bodies.some((b) => b.startsWith("new"))).toBe(true);
    expect(bodies.some((b) => b.startsWith("rm"))).toBe(true);
    const provision = fetchMock.mock.calls.find((c) =>
      String((c[1] as RequestInit)?.body ?? "").startsWith("new"),
    );
    expect((provision?.[1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer exe_key",
    });
  });

  it("fails clearly (no fetch) when the workspace has no EXE_DEV_API_KEY", async () => {
    const agentId = await makeAgent();
    const taskId = await makeTask();
    await expect(runTaskInSandbox({ workspaceId: WS, taskId, agentId })).rejects.toThrow(
      /not configured|EXE_DEV_API_KEY|vault/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
