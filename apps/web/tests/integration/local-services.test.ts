import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  registerLocalService,
  recordServiceHealth,
  requestServiceRestart,
  recordServiceCrash,
  findEvictableServices,
  markServiceEvicted,
} from "../../src/server/services/local-services";

// Parity #95 — local service supervision registry + restart-storm / idle-evict.
const WS = "ws_localsvc";

beforeEach(async () => {
  await prisma.localService.deleteMany({ where: { workspaceId: WS } });
});

describe("local services (#95)", () => {
  it("registers, records health, and crashes", async () => {
    await registerLocalService({ workspaceId: WS, key: "mcp:fs", command: "npx mcp-fs" });
    const healthy = await recordServiceHealth(WS, "mcp:fs", 4242);
    expect(healthy).toMatchObject({ status: "running", pid: 4242 });
    await recordServiceCrash(WS, "mcp:fs", "exited 1");
    expect((await prisma.localService.findFirst({ where: { workspaceId: WS } }))?.status).toBe(
      "crashed",
    );
  });

  it("allows restarts within budget then suppresses the storm", async () => {
    await registerLocalService({ workspaceId: WS, key: "mcp:flaky" });
    let lastAllowed = true;
    for (let i = 0; i < 3; i++) {
      const { decision } = await requestServiceRestart(WS, "mcp:flaky", {
        maxRestarts: 3,
        windowMs: 60_000,
      });
      lastAllowed = decision.allow;
    }
    expect(lastAllowed).toBe(true); // 3rd restart still counts 2 prior in-window → allowed
    // 4th within the window → suppressed
    const { decision, service } = await requestServiceRestart(WS, "mcp:flaky", {
      maxRestarts: 3,
      windowMs: 60_000,
    });
    expect(decision.allow).toBe(false);
    expect(service.status).toBe("suppressed");
  });

  it("finds and evicts idle services", async () => {
    await registerLocalService({ workspaceId: WS, key: "mcp:idle" });
    await recordServiceHealth(WS, "mcp:idle");
    // backdate activity
    await prisma.localService.updateMany({
      where: { workspaceId: WS, key: "mcp:idle" },
      data: { lastActivityAt: new Date(Date.now() - 10 * 60_000) },
    });
    const evictable = await findEvictableServices(WS, 5 * 60_000);
    expect(evictable.map((s) => s.key)).toEqual(["mcp:idle"]);
    await markServiceEvicted(WS, "mcp:idle");
    expect((await prisma.localService.findFirst({ where: { workspaceId: WS } }))?.status).toBe(
      "evicted",
    );
  });
});
