import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { agentCache } from "../../src/server/cache";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import { GET as GET_COMMANDS } from "../../app/api/runner/commands/route";
import { POST as POST_RESULT } from "../../app/api/runner/commands/[id]/result/route";
import { createRunnerCommand } from "../../src/server/services/runner-commands";

// Tier D (Slice 2): the outbound runner daemon poll path. Agent-key auth, atomic claim, agent-scoped
// result posting, feature gate. License is bypassed under VITEST, so resolveAgent works directly.
const WS = "ws_pollrunner";
const KEY = "mc_pollrunner_key";
let agentId = "";

async function makeAgent(key: string, workspaceId = WS): Promise<string> {
  const agent = await prisma.agent.create({
    data: {
      name: `runner-${key.slice(-6)}`,
      role: "runner",
      workspaceId,
      setupStatus: "active",
      apiKeyHash: hashApiKey(key),
    },
  });
  return agent.id;
}

function getCommands(key: string, limit?: number) {
  const url = `http://test/api/runner/commands${limit ? `?limit=${limit}` : ""}`;
  return GET_COMMANDS(new Request(url, { headers: { Authorization: `Bearer ${key}` } }), {
    params: Promise.resolve({}),
  });
}

function postResult(key: string, id: string, body: unknown) {
  return POST_RESULT(
    new Request(`http://test/api/runner/commands/${id}/result`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function enableRunners() {
  await prisma.featureFlag.upsert({
    where: { key: "runners" },
    create: { key: "runners", enabled: true, managedBy: "user" },
    update: { enabled: true },
  });
  invalidateFlagCache();
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = "poll-secret";
});
beforeEach(async () => {
  agentCache.clear();
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE runner_commands, agents CASCADE`);
  await prisma.featureFlag.deleteMany({ where: { key: "runners" } });
  invalidateFlagCache();
  await enableRunners();
  agentId = await makeAgent(KEY);
});

describe("runner poll endpoints (Tier D Slice 2)", () => {
  it("claims queued agent commands and marks them running", async () => {
    await createRunnerCommand({
      workspaceId: WS,
      targetKind: "agent",
      targetId: agentId,
      command: "echo one",
    });
    const res = await getCommands(KEY);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.commands).toHaveLength(1);
    expect(body.commands[0].command).toBe("echo one");

    const row = await prisma.runnerCommand.findFirstOrThrow({ where: { targetId: agentId } });
    expect(row.status).toBe("running");
    expect(row.claimedAt).toBeTruthy();
  });

  it("a second poll returns nothing (already claimed — no double-run)", async () => {
    await createRunnerCommand({
      workspaceId: WS,
      targetKind: "agent",
      targetId: agentId,
      command: "echo once",
    });
    await getCommands(KEY);
    const second = await (await getCommands(KEY)).json();
    expect(second.commands).toHaveLength(0);
  });

  it("does not hand an agent another agent's commands", async () => {
    const otherId = await makeAgent("mc_other_runner_key");
    await createRunnerCommand({
      workspaceId: WS,
      targetKind: "agent",
      targetId: otherId,
      command: "not mine",
    });
    const body = await (await getCommands(KEY)).json();
    expect(body.commands).toHaveLength(0);
  });

  it("records a posted result and closes the command", async () => {
    const cmd = await createRunnerCommand({
      workspaceId: WS,
      targetKind: "agent",
      targetId: agentId,
      command: "run",
    });
    await getCommands(KEY); // claim → running
    const res = await postResult(KEY, cmd.id, { exitCode: 0, stdout: "done\n" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: "done" });

    const row = await prisma.runnerCommand.findUniqueOrThrow({ where: { id: cmd.id } });
    expect(row.status).toBe("done");
    expect(row.exitCode).toBe(0);
    expect(row.stdout).toBe("done\n");
    expect(row.finishedAt).toBeTruthy();
  });

  it("marks failed when the daemon reports an error without an exit code", async () => {
    const cmd = await createRunnerCommand({
      workspaceId: WS,
      targetKind: "agent",
      targetId: agentId,
      command: "explode",
    });
    await getCommands(KEY);
    await postResult(KEY, cmd.id, { errorMessage: "spawn failed" });
    const row = await prisma.runnerCommand.findUniqueOrThrow({ where: { id: cmd.id } });
    expect(row.status).toBe("failed");
    expect(row.errorMessage).toBe("spawn failed");
  });

  it("rejects a result for a command that was never claimed", async () => {
    const cmd = await createRunnerCommand({
      workspaceId: WS,
      targetKind: "agent",
      targetId: agentId,
      command: "queued still",
    });
    const res = await postResult(KEY, cmd.id, { exitCode: 0 });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects an unauthenticated poll", async () => {
    const res = await GET_COMMANDS(new Request("http://test/api/runner/commands"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(401);
  });

  it("is feature-gated", async () => {
    await prisma.featureFlag.upsert({
      where: { key: "runners" },
      create: { key: "runners", enabled: false, managedBy: "user" },
      update: { enabled: false },
    });
    invalidateFlagCache();
    const res = await getCommands(KEY);
    expect(res.status).toBe(403);
  });
});
