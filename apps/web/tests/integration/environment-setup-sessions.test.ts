import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  startSetupSession,
  attachSetupTerminal,
  finishSetupSession,
  abortSetupSession,
  listSetupSessions,
  cleanupExpiredSetupSessions,
} from "../../src/server/services/environment-setup-sessions";

// Parity #47/#48 — setup-session lifecycle. The provider snapshot is stubbed (real capture needs a live
// sandbox); this exercises the orchestration + expiry reaper offline.
const WS = "ws_setupsess";
const ENV = "env-1";

beforeEach(async () => {
  await prisma.environmentCustomImageSetupSession.deleteMany({ where: { workspaceId: WS } });
});

describe("setup sessions (#47/#48)", () => {
  it("start → attach terminal → finish (captured with resultTemplateId)", async () => {
    const s = await startSetupSession({ workspaceId: WS, environmentId: ENV });
    expect(s.status).toBe("active");
    await attachSetupTerminal(WS, s.id, "ts_abc");

    const done = await finishSetupSession(WS, s.id, async () => "tpl-123");
    expect(done).toMatchObject({ status: "captured", resultTemplateId: "tpl-123" });
  });

  it("a capture failure lands the session in failed with the error", async () => {
    const s = await startSetupSession({ workspaceId: WS, environmentId: ENV });
    const failed = await finishSetupSession(WS, s.id, async () => {
      throw new Error("provider has no snapshot support");
    });
    expect(failed.status).toBe("failed");
    expect(failed.lastError).toMatch(/snapshot support/);
  });

  it("cannot finish an aborted session", async () => {
    const s = await startSetupSession({ workspaceId: WS, environmentId: ENV });
    await abortSetupSession(WS, s.id);
    await expect(finishSetupSession(WS, s.id, async () => "x")).rejects.toThrow(/terminal/);
  });

  it("the reaper expires active sessions past their TTL", async () => {
    const s = await startSetupSession({ workspaceId: WS, environmentId: ENV, ttlMs: 60_000 });
    await prisma.environmentCustomImageSetupSession.update({
      where: { id: s.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await cleanupExpiredSetupSessions(WS)).toBe(1);
    expect((await listSetupSessions(WS, ENV))[0].status).toBe("expired");
  });
});
