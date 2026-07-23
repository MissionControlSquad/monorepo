import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  getActiveSession,
  startSession,
  recordSessionRun,
} from "../../src/server/services/adapter-sessions";

// Parity #F9 — adapter session persistence + rotation.
const WS = "ws_adaptersess";
const AGENT = "agent-s";

beforeEach(async () => {
  await prisma.adapterSession.deleteMany({ where: { workspaceId: WS } });
});

describe("adapter sessions (#F9)", () => {
  it("starts a session, resumes it, and supersedes on restart", async () => {
    const s1 = await startSession({
      workspaceId: WS,
      agentId: AGENT,
      adapterKey: "claude",
      params: { sessionId: "s1" },
    });
    expect((await getActiveSession(WS, AGENT, "claude"))?.id).toBe(s1.id);
    const s2 = await startSession({
      workspaceId: WS,
      agentId: AGENT,
      adapterKey: "claude",
      params: { sessionId: "s2" },
    });
    expect((await getActiveSession(WS, AGENT, "claude"))?.id).toBe(s2.id);
    // prior session deactivated
    expect((await prisma.adapterSession.findUnique({ where: { id: s1.id } }))?.active).toBe(false);
  });

  it("records runs and rotates when the compaction policy fires", async () => {
    await startSession({
      workspaceId: WS,
      agentId: AGENT,
      adapterKey: "claude",
      params: { sessionId: "s1" },
    });
    const r1 = await recordSessionRun(WS, AGENT, "claude", { tokens: 100 }, { maxRuns: 2 });
    expect(r1.rotated).toBe(false);
    const r2 = await recordSessionRun(WS, AGENT, "claude", { tokens: 100 }, { maxRuns: 2 });
    expect(r2.rotated).toBe(true);
    expect(r2.reason).toMatch(/run count/);
    expect(await getActiveSession(WS, AGENT, "claude")).toBeNull(); // rotated out
  });

  it("recordSessionRun is a no-op when there is no active session", async () => {
    const res = await recordSessionRun(WS, AGENT, "claude", { tokens: 10 });
    expect(res).toEqual({ session: null, rotated: false, reason: null });
  });
});
