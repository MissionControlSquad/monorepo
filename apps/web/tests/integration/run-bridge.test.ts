import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { FLAG_KEYS } from "@agentcenter/utils";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { invalidateFlagCache, setTestFeature } from "../../src/server/feature-flags";
import { POST as _BRIDGE_MESSAGE } from "../../app/api/runner/bridge/message/route";
// message route is now wrapped by withFeature (2-arg); it is static, so supply a dummy ctx.
const BRIDGE_MESSAGE = (req: Request) => _BRIDGE_MESSAGE(req, undefined as never);
import {
  mintRunBridgeToken,
  hashBridgeToken,
  verifyRunBridgeToken,
  attachRunBridgeToken,
} from "../../src/server/services/run-bridge";

const WS = "ws_bridge";

beforeAll(() => {
  process.env.SYSTEM_SECRET = "bridge-secret";
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE agent_runs, messages, tasks, agents, profiles CASCADE`,
  );
  setTestFeature(FLAG_KEYS.RUNNERS, true);
  invalidateFlagCache();
});

async function makeRunningRun(status = "running") {
  const agent = await prisma.agent.create({
    data: {
      name: "A",
      role: "worker",
      personality: "x",
      workspaceId: WS,
      setupStatus: "active",
      apiKeyHash: hashApiKey(`mc_br_${Math.random()}`),
    },
  });
  const task = await prisma.task.create({
    data: { title: "t", description: "d", status: "assigned", priority: "high", tags: [] },
  });
  const run = await prisma.agentRun.create({
    data: { workspaceId: WS, agentId: agent.id, taskId: task.id, kind: "sandbox", status },
  });
  return { agent, task, run };
}

function bridgeReq(token: string, body: unknown) {
  return new Request("http://test/api/runner/bridge/message", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe("run bridge token", () => {
  it("mints a prefixed token whose hash is stable", () => {
    const { token, hash } = mintRunBridgeToken();
    expect(token.startsWith("rbt_")).toBe(true);
    expect(hash).toBe(hashBridgeToken(token));
  });

  it("verifies a token only for a RUNNING run", async () => {
    const { run } = await makeRunningRun();
    const token = await attachRunBridgeToken(run.id);
    const v = await verifyRunBridgeToken(token);
    expect(v).toMatchObject({ runId: run.id, workspaceId: WS });

    // wrong token → null
    expect(await verifyRunBridgeToken("rbt_wrong")).toBeNull();

    // once the run is no longer running, the token is dead
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "done" } });
    expect(await verifyRunBridgeToken(token)).toBeNull();
  });
});

describe("POST /api/runner/bridge/message", () => {
  it("posts a message to the run's task with a valid token", async () => {
    const { run, task } = await makeRunningRun();
    const token = await attachRunBridgeToken(run.id);

    const res = await BRIDGE_MESSAGE(bridgeReq(token, { content: "halfway done" }));
    expect(res.status).toBe(200);
    const messages = await prisma.message.findMany({ where: { taskId: task.id } });
    expect(messages.some((m) => m.content === "halfway done")).toBe(true);
  });

  it("rejects an invalid token (401) and posts nothing", async () => {
    const { task } = await makeRunningRun();
    const res = await BRIDGE_MESSAGE(bridgeReq("rbt_nope", { content: "x" }));
    expect(res.status).toBe(401);
    expect(await prisma.message.count({ where: { taskId: task.id } })).toBe(0);
  });

  it("rejects a token for a finished run (401)", async () => {
    const { run } = await makeRunningRun();
    const token = await attachRunBridgeToken(run.id);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "done" } });
    const res = await BRIDGE_MESSAGE(bridgeReq(token, { content: "late" }));
    expect(res.status).toBe(401);
  });

  it("rejects empty content (400)", async () => {
    const { run } = await makeRunningRun();
    const token = await attachRunBridgeToken(run.id);
    const res = await BRIDGE_MESSAGE(bridgeReq(token, { content: "   " }));
    expect(res.status).toBe(400);
  });
});
