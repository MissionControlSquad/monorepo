import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "../../src/server/prisma";
import { createJWT } from "../../src/lib/jwt";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import { invalidateFlagCache } from "../../src/server/feature-flags";

// Real SSH is mocked; the host row + credential decryption run for real (no SSH_KEY_ENCRYPTION_SECRET
// in test env → raw key path). Covers the "host" RunnerCommand target end-to-end + the security
// boundary that the private key is NEVER returned.
vi.mock("../../src/server/services/ssh", async (orig) => {
  const actual = await orig<typeof import("../../src/server/services/ssh")>();
  return { ...actual, sshExec: vi.fn() };
});

import { sshExec } from "../../src/server/services/ssh";
import {
  createRunnerHost,
  listRunnerHosts,
  getHostSSHConfig,
} from "../../src/server/services/runner-hosts";
import { runCommandOnHost } from "../../src/server/services/runner-commands";

const mockedSshExec = vi.mocked(sshExec);
const SECRET = "host-secret";
const WS = "ws_host";

async function gql(
  query: string,
  variables?: Record<string, unknown>,
  role: "admin" | "member" = "admin",
) {
  const token = await createJWT({ userId: "human_x", workspaceId: WS, userRole: role }, SECRET);
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `bb-workspace-token=${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return JSON.parse(await (await GRAPHQL(req)).text()) as {
    data?: any;
    errors?: { message: string }[];
  };
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
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  mockedSshExec.mockReset();
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE runner_hosts, runner_commands CASCADE`);
  await prisma.featureFlag.deleteMany({ where: { key: "runners" } });
  invalidateFlagCache();
});

describe("runner-hosts service (Tier D)", () => {
  it("creates a host, stores the key, and never returns it in the safe shape", async () => {
    const safe = await createRunnerHost({
      workspaceId: WS,
      name: "prod",
      host: "10.1.2.3",
      username: "deploy",
      privateKey: "SECRET_KEY",
    });
    expect(safe).not.toHaveProperty("sshPrivateKey");
    const list = await listRunnerHosts(WS);
    expect(list[0]).not.toHaveProperty("sshPrivateKey");
    // the row DOES hold the key (server-internal)
    const row = await prisma.runnerHost.findFirstOrThrow({ where: { workspaceId: WS } });
    expect(row.sshPrivateKey).toBe("SECRET_KEY");
    expect(getHostSSHConfig(row)).toMatchObject({ host: "10.1.2.3", username: "deploy" });
  });

  it("runs a command on a host over direct SSH and persists the result", async () => {
    const host = await createRunnerHost({
      workspaceId: WS,
      name: "h",
      host: "10.1.2.3",
      privateKey: "K",
    });
    mockedSshExec.mockResolvedValue({ stdout: "linux\n", stderr: "", code: 0 });
    const cmd = await runCommandOnHost({ workspaceId: WS, hostId: host.id, command: "uname" });
    expect(cmd.status).toBe("done");
    expect(cmd.targetKind).toBe("host");
    expect(cmd.stdout).toBe("linux\n");
    // sshExec was called with the decrypted host config
    expect(mockedSshExec.mock.calls[0][0]).toMatchObject({ host: "10.1.2.3", privateKey: "K" });
  });

  it("fails cleanly when the host does not exist", async () => {
    await expect(
      runCommandOnHost({ workspaceId: WS, hostId: "nope", command: "x" }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("runner-hosts GraphQL (Tier D)", () => {
  it("admin adds a host + runs a command; the private key is never queryable; member denied; gated", async () => {
    await enableRunners();
    const created = await gql(
      `mutation{ createRunnerHost(name:"prod", host:"10.9.9.9", username:"root", privateKey:"PK"){ id host } }`,
    );
    expect(created.errors).toBeFalsy();
    const hostId = created.data.createRunnerHost.id;

    // sshPrivateKey is NOT a field on the type → selecting it is a validation error.
    const leak = await gql(`query{ runnerHosts{ id sshPrivateKey } }`);
    expect(leak.errors).toBeDefined();

    const list = await gql(`query{ runnerHosts{ id name host username } }`);
    expect(list.data.runnerHosts).toHaveLength(1);

    mockedSshExec.mockResolvedValue({ stdout: "ok", stderr: "", code: 0 });
    const run = await gql(
      `mutation($h:String!){ runCommandOnHost(hostId:$h, command:"echo ok"){ status exitCode stdout } }`,
      { h: hostId },
    );
    expect(run.data.runCommandOnHost).toMatchObject({ status: "done", exitCode: 0, stdout: "ok" });

    // member cannot manage hosts
    const denied = await gql(
      `mutation{ createRunnerHost(name:"x", host:"1.1.1.1", privateKey:"k"){ id } }`,
      undefined,
      "member",
    );
    expect(denied.errors).toBeDefined();

    // gate off
    await prisma.featureFlag.upsert({
      where: { key: "runners" },
      create: { key: "runners", enabled: false, managedBy: "user" },
      update: { enabled: false },
    });
    invalidateFlagCache();
    const gated = await gql(`query{ runnerHosts{ id } }`);
    expect(gated.errors).toBeDefined();
  });

  it("queueAgentCommand is reachable for admins (agent-target dispatch)", async () => {
    await enableRunners();
    const agent = await prisma.agent.create({
      data: { name: "R", role: "runner", workspaceId: WS, setupStatus: "active" },
    });
    const res = await gql(
      `mutation($a:String!){ queueAgentCommand(agentId:$a, command:"echo hi"){ id status } }`,
      { a: agent.id },
    );
    expect(res.errors).toBeFalsy();
    expect(res.data.queueAgentCommand.status).toBe("queued");
  });
});
