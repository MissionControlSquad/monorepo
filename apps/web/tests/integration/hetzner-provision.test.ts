import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../src/server/prisma";
import { createSecret } from "../../src/server/services/secrets";

// The Hetzner HTTP client is mocked; the vault resolution, keypair generation, and RunnerHost row
// (with credential handling) all run for real. Proves the provisioner uses the WORKSPACE's own token
// (BYO) and lands a RunnerHost — no CloudVM, no operator env token.
vi.mock("../../src/server/services/hetzner", () => ({
  createSSHKey: vi.fn(async () => ({ sshKeyId: "k1", fingerprint: "fp" })),
  createServer: vi.fn(async () => ({
    serverId: "s1",
    ipv4: "203.0.113.7",
    status: "initializing",
  })),
  deleteServer: vi.fn(async () => {}),
  deleteSSHKey: vi.fn(async () => {}),
}));

import {
  createServer,
  createSSHKey,
  deleteServer,
  deleteSSHKey,
} from "../../src/server/services/hetzner";
import { provisionHetznerHost } from "../../src/server/services/hetzner-provision";
import { listRunnerHosts } from "../../src/server/services/runner-hosts";

const WS = "ws_hz";

async function clearVault() {
  const ids = (
    await prisma.secret.findMany({ where: { workspaceId: WS }, select: { id: true } })
  ).map((s) => s.id);
  if (ids.length) {
    await prisma.secretVersion.deleteMany({ where: { secretId: { in: ids } } });
    await prisma.secretAccessEvent.deleteMany({ where: { secretId: { in: ids } } });
    await prisma.secret.deleteMany({ where: { id: { in: ids } } });
  }
}

beforeEach(async () => {
  vi.clearAllMocks();
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE runner_hosts CASCADE`);
  await clearVault();
});

describe("BYO Hetzner provisioner → RunnerHost", () => {
  it("throws when the workspace vault has no HETZNER_API_TOKEN", async () => {
    await expect(provisionHetznerHost({ workspaceId: WS, name: "box" })).rejects.toThrow(
      /not configured|HETZNER_API_TOKEN|vault/i,
    );
    expect(vi.mocked(createServer)).not.toHaveBeenCalled();
  });

  it("provisions on the workspace's own token and registers a RunnerHost (key never returned)", async () => {
    await createSecret({
      workspaceId: WS,
      name: "HETZNER_API_TOKEN",
      value: "hz_tok",
      createdBy: "h",
    });

    const host = await provisionHetznerHost({
      workspaceId: WS,
      name: "My Box",
      region: "nbg1",
      serverType: "cx22",
    });

    // Used the CUSTOMER's token + requested spec.
    expect(vi.mocked(createSSHKey)).toHaveBeenCalledWith(
      expect.objectContaining({ publicKey: expect.any(String) }),
      "hz_tok",
    );
    expect(vi.mocked(createServer)).toHaveBeenCalledWith(
      expect.objectContaining({ serverType: "cx22", location: "nbg1", image: "ubuntu-24.04" }),
      "hz_tok",
    );

    // Registered as a RunnerHost at the assigned IP; the private key is never surfaced.
    expect(host.host).toBe("203.0.113.7");
    expect(host.name).toBe("My Box");
    expect((host as Record<string, unknown>).sshPrivateKey).toBeUndefined();

    const hosts = await listRunnerHosts(WS);
    expect(hosts).toHaveLength(1);
    expect(hosts[0].host).toBe("203.0.113.7");
  });

  it("cleans up the server + SSH key when provisioning fails mid-way", async () => {
    await createSecret({
      workspaceId: WS,
      name: "HETZNER_API_TOKEN",
      value: "hz_tok",
      createdBy: "h",
    });
    vi.mocked(createServer).mockResolvedValueOnce({
      serverId: "s9",
      ipv4: "",
      status: "initializing",
    });

    await expect(provisionHetznerHost({ workspaceId: WS, name: "bad" })).rejects.toThrow(/IPv4/i);
    expect(vi.mocked(deleteServer)).toHaveBeenCalledWith("s9", "hz_tok");
    expect(vi.mocked(deleteSSHKey)).toHaveBeenCalledWith("k1", "hz_tok");
    expect(await listRunnerHosts(WS)).toHaveLength(0);
  });
});
