import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  openTerminalSession,
  activateTerminalByConnectToken,
  resolveTerminalSshConfig,
} from "../../src/server/services/terminals";

// Tier D (Slice 6): the token-first activation + SSH-credential resolution that back the browser
// Cloud-Shell PTY relay. The live byte stream needs a real SSH target (flagged infra); everything
// here — token auth, lifecycle, and credential lookup — is exercised without a live connection.
const WS = "ws_pty";

async function makeVM(ipv4: string): Promise<string> {
  const vm = await prisma.cloudVM.create({
    data: { workspaceId: WS, status: "running", ipv4, sshPrivateKey: "PRIVATE_KEY" },
  });
  return vm.id;
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE terminal_sessions, cloud_vms CASCADE`);
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

  it("resolves SSH credentials for a managed VM target (matched by IP)", async () => {
    await makeVM("10.0.0.5");
    const { session } = await openTerminalSession({
      workspaceId: WS,
      command: "ssh deploy@10.0.0.5",
    });
    const config = await resolveTerminalSshConfig(session);
    expect(config).not.toBeNull();
    expect(config?.host).toBe("10.0.0.5");
    expect(config?.username).toBe("deploy");
  });

  it("returns null credentials for a host that is not a managed VM", async () => {
    const { session } = await openTerminalSession({
      workspaceId: WS,
      command: "ssh deploy@1.2.3.4",
    });
    expect(await resolveTerminalSshConfig(session)).toBeNull();
  });

  it("does not resolve a VM from another workspace", async () => {
    await prisma.cloudVM.create({
      data: { workspaceId: "ws_other", status: "running", ipv4: "10.0.0.9", sshPrivateKey: "K" },
    });
    const { session } = await openTerminalSession({
      workspaceId: WS,
      command: "ssh deploy@10.0.0.9",
    });
    expect(await resolveTerminalSshConfig(session)).toBeNull();
  });
});
