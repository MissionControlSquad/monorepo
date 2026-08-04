import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  createSmokeCase,
  listSmokeCases,
  runSmokeCase,
  runSmokeSuite,
} from "../../src/server/services/smoke-lab";
import { setToolAccessPolicy } from "../../src/server/services/tool-access-policies";

// Parity #153 — tool smoke-lab running cases through the gateway.
const WS = "ws_smoke";

beforeEach(async () => {
  await Promise.all([
    prisma.smokeCase.deleteMany({ where: { workspaceId: WS } }),
    prisma.toolAccessPolicy.deleteMany({ where: { workspaceId: WS } }),
    prisma.toolContentGuard.deleteMany({ where: { workspaceId: WS } }),
    prisma.toolInvocation.deleteMany({ where: { workspaceId: WS } }),
  ]);
});

describe("smoke lab (#153)", () => {
  it("validates expectDecision and lists cases", async () => {
    await expect(
      createSmokeCase({ workspaceId: WS, name: "x", toolName: "t", expectDecision: "maybe" }),
    ).rejects.toThrow(/allow or deny/);
    await createSmokeCase({
      workspaceId: WS,
      name: "allow echo",
      toolName: "echo",
      expectDecision: "allow",
    });
    expect(await listSmokeCases(WS)).toHaveLength(1);
  });

  it("a case passes when the gateway matches the expectation", async () => {
    const c = await createSmokeCase({
      workspaceId: WS,
      name: "echo ok",
      toolName: "echo",
      expectDecision: "allow",
    });
    const res = await runSmokeCase(WS, c.id);
    expect(res).toMatchObject({ result: "pass", expected: "allow", actual: "allow" });
    // outcome recorded on the case
    expect((await prisma.smokeCase.findUnique({ where: { id: c.id } }))?.lastResult).toBe("pass");
  });

  it("a case fails when policy denies a call it expected to allow", async () => {
    await setToolAccessPolicy({
      workspaceId: WS,
      toolPattern: "danger",
      effect: "deny",
      priority: 10,
    });
    await createSmokeCase({
      workspaceId: WS,
      name: "danger allowed?",
      toolName: "danger",
      expectDecision: "allow",
    });
    await createSmokeCase({
      workspaceId: WS,
      name: "danger denied",
      toolName: "danger",
      expectDecision: "deny",
    });

    const suite = await runSmokeSuite(WS);
    expect(suite.passed).toBe(1); // the "deny" expectation
    expect(suite.failed).toBe(1); // the "allow" expectation
  });
});
