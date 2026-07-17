import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { agentCache } from "../../src/server/cache";
import { createSecret } from "../../src/server/services/secrets";
import { runTaskInSandbox } from "../../src/server/services/sandbox-run";

// Provider 5 (Cloudflare) through the seam. No SDK — a REST client to a bridge Worker; global fetch is
// mocked. Proves the workspace's own bridge URL + token drive acquire → exec → delete.
const WS = "ws_cf";

const realFetch = globalThis.fetch;
const fetchMock = vi.fn();
const textRes = (obj: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(obj),
});

async function makeAgent(): Promise<string> {
  const agent = await prisma.agent.create({
    data: {
      name: "CF Agent",
      role: "worker",
      personality: "diligent",
      workspaceId: WS,
      setupStatus: "active",
      apiKeyHash: hashApiKey(`mc_cf_${Math.random()}`),
      runtimeAdapter: "shell",
      runtimeTemplate: "echo CF_RAN && cat TASK.md",
      sandboxProvider: "cloudflare",
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
  process.env.SYSTEM_SECRET = "cf-secret";
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
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (u.includes("/leases/acquire"))
      return textRes({
        providerLeaseId: "lease_1",
        metadata: { remoteCwd: "/workspace/paperclip" },
      });
    if (u.endsWith("/exec"))
      return textRes({
        exitCode: 0,
        stdout: `CF_EXEC ${/cat TASK\.md/.test(body.command ?? "") ? "HAS_TASK_MD" : ""}`,
        stderr: "",
      });
    return textRes({ ok: true }); // DELETE lease
  });
});

async function seedBridge() {
  await createSecret({
    workspaceId: WS,
    name: "CLOUDFLARE_SANDBOX_BRIDGE_URL",
    value: "https://bridge.example.com",
    createdBy: "h",
  });
  await createSecret({
    workspaceId: WS,
    name: "CLOUDFLARE_SANDBOX_BRIDGE_TOKEN",
    value: "cf_token",
    createdBy: "h",
  });
}

describe("Cloudflare sandbox provider (through the seam)", () => {
  it("runs a task via the bridge Worker using the workspace's URL + token", async () => {
    await seedBridge();
    const agentId = await makeAgent();
    const taskId = await makeTask();

    const result = await runTaskInSandbox({ workspaceId: WS, taskId, agentId });

    expect(result.providerKey).toBe("cloudflare");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("CF_EXEC");
    expect(result.stdout).toContain("HAS_TASK_MD");

    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes("/leases/acquire"))).toBe(true);
    expect(calls.some((u) => u.endsWith("/exec"))).toBe(true);
    expect(calls.some((u) => u.includes("/leases/lease_1"))).toBe(true); // DELETE teardown
    // The workspace's own bridge token was used as the bearer.
    const acquire = fetchMock.mock.calls.find((c) => String(c[0]).includes("/leases/acquire"));
    expect((acquire?.[1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer cf_token",
    });
  });

  it("fails clearly (no fetch) when the workspace has no bridge config", async () => {
    const agentId = await makeAgent();
    const taskId = await makeTask();
    await expect(runTaskInSandbox({ workspaceId: WS, taskId, agentId })).rejects.toThrow(
      /not configured|CLOUDFLARE_SANDBOX_BRIDGE|vault/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
