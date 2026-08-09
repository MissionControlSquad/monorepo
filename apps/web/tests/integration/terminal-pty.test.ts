import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  openTerminalSession,
  activateTerminalByConnectToken,
  resolveTerminalSshConfig,
  reapStaleTerminalSessions,
} from "../../src/server/services/terminals";

// Tier D (Slice 6): the token-first activation + SSH-credential resolution that back the browser
// Cloud-Shell PTY relay. The live byte stream needs a real SSH target (flagged infra); everything
// here — token auth, lifecycle, and credential lookup — is exercised without a live connection.
const WS = "ws_pty";

async function makeHost(host: string, workspaceId = WS): Promise<string> {
  const h = await prisma.runnerHost.create({
    data: { workspaceId, name: "box", host, username: "root", sshPrivateKey: "PRIVATE_KEY" },
  });
  return h.id;
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE terminal_sessions, runner_hosts CASCADE`);
});

describe("terminal PTY activation (Tier D Slice 6)", () => {
  it("activates a session with the correct token and flips it to active", async () => {
    const { session, connectToken } = await openTerminalSession({
      workspaceId: WS,
      command: "ssh deploy@10.0.0.5",
    });
    const active = await activateTerminalByConnectToken(session.id, connectToken);
    expect(active.status).toBe("active");
    expect(active.lastActivityAt).toBeTruthy();
  });

  it("rejects a wrong token", async () => {
    const { session } = await openTerminalSession({ workspaceId: WS, command: "ssh a@b" });
    await expect(activateTerminalByConnectToken(session.id, "ts_wrong")).rejects.toThrow(
      /Invalid connect token/,
    );
  });

  it("rejects an expired connect token", async () => {
    const { session, connectToken } = await openTerminalSession({
      workspaceId: WS,
      command: "ssh a@b",
    });
    const future = new Date(Date.now() + 10 * 60 * 1000); // past the 5-min connect TTL
    await expect(activateTerminalByConnectToken(session.id, connectToken, future)).rejects.toThrow(
      /expired/,
    );
  });

  it("cannot be activated twice", async () => {
    const { session, connectToken } = await openTerminalSession({
      workspaceId: WS,
      command: "ssh a@b",
    });
    await activateTerminalByConnectToken(session.id, connectToken);
    await expect(activateTerminalByConnectToken(session.id, connectToken)).rejects.toThrow(
      /awaiting connection/,
    );
  });

  it("resolves SSH credentials for a registered RunnerHost (matched by host)", async () => {
    await makeHost("10.0.0.5");
    const { session } = await openTerminalSession({
      workspaceId: WS,
      command: "ssh deploy@10.0.0.5",
    });
    const config = await resolveTerminalSshConfig(session);
    expect(config).not.toBeNull();
    expect(config?.host).toBe("10.0.0.5");
    expect(config?.username).toBe("deploy");
  });

  it("returns null credentials for a host that is not a registered RunnerHost", async () => {
    const { session } = await openTerminalSession({
      workspaceId: WS,
      command: "ssh deploy@1.2.3.4",
    });
    expect(await resolveTerminalSshConfig(session)).toBeNull();
  });

  it("does not resolve a RunnerHost from another workspace", async () => {
    await makeHost("10.0.0.9", "ws_other");
    const { session } = await openTerminalSession({
      workspaceId: WS,
      command: "ssh deploy@10.0.0.9",
    });
    expect(await resolveTerminalSshConfig(session)).toBeNull();
  });

  it("reaps stale sessions: never-connected pending → expired, orphaned active → closed", async () => {
    // A never-connected pending session whose connect window has passed.
    const { session: stale } = await openTerminalSession({ workspaceId: WS, command: "ssh a@b" });
    await prisma.terminalSession.update({
      where: { id: stale.id },
      data: {
        connectExpiresAt: new Date(Date.now() - 60_000),
        sessionExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    // An active session orphaned past its overall TTL (process died before teardown).
    const { session: orphan, connectToken } = await openTerminalSession({
      workspaceId: WS,
      command: "ssh c@d",
    });
    await activateTerminalByConnectToken(orphan.id, connectToken);
    await prisma.terminalSession.update({
      where: { id: orphan.id },
      data: { sessionExpiresAt: new Date(Date.now() - 60_000) },
    });
    // A fresh pending session must be left alone.
    const { session: fresh } = await openTerminalSession({ workspaceId: WS, command: "ssh e@f" });

    const res = await reapStaleTerminalSessions(new Date());
    expect(res.expired).toBe(1);
    expect(res.closed).toBe(1);
    expect(
      (await prisma.terminalSession.findUniqueOrThrow({ where: { id: stale.id } })).status,
    ).toBe("expired");
    expect(
      (await prisma.terminalSession.findUniqueOrThrow({ where: { id: orphan.id } })).status,
    ).toBe("closed");
    expect(
      (await prisma.terminalSession.findUniqueOrThrow({ where: { id: fresh.id } })).status,
    ).toBe("pending");
  });
});
