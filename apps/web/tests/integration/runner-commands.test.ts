import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "../../src/server/prisma";
import { createJWT } from "../../src/lib/jwt";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import { invalidateFlagCache } from "../../src/server/feature-flags";

// Isolate the RunnerCommand lifecycle from real SSH + key decryption:
//   • sshExec is mocked so no network happens; we control its result per test.
//   • getVMSSHConfig is mocked so we don't depend on SSH_KEY_ENCRYPTION_SECRET.
vi.mock("../../src/server/services/ssh", () => ({
  sshExec: vi.fn(),
  sshExecStream: vi.fn(),
  sshUploadFile: vi.fn(),
  sshTestConnection: vi.fn(),
}));
vi.mock("../../src/server/services/cloud-vm-utils", () => ({
  getVMSSHConfig: vi.fn(() => ({ host: "1.2.3.4", privateKey: "KEY" })),
}));

import { sshExec } from "../../src/server/services/ssh";
import {
  createRunnerCommand,
  runQueuedCommand,
  runCommandOnVM,
  cancelRunnerCommand,
  capOutput,
} from "../../src/server/services/runner-commands";

const mockedSshExec = vi.mocked(sshExec);

/** Tier D: runner commands — raw shell over SSH, server-side execution, status transitions, gate. */
const SECRET = "runner-secret";
const WS = "ws_runner";

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

async function makeVM(): Promise<string> {
  const vm = await prisma.cloudVM.create({
    data: { workspaceId: WS, status: "running", ipv4: "1.2.3.4", sshPrivateKey: "KEY" },
  });
  return vm.id;
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
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE runner_commands, cloud_vms CASCADE`);
  await prisma.featureFlag.deleteMany({ where: { key: "runners" } });
  invalidateFlagCache();
});

describe("runner-commands service (Tier D)", () => {
  it("runs a queued command on a VM and persists exit/stdout/stderr", async () => {
    const vmId = await makeVM();
    mockedSshExec.mockResolvedValue({ stdout: "hello\n", stderr: "", code: 0 });

    const cmd = await createRunnerCommand({
      workspaceId: WS,
      targetKind: "cloud_vm",
      targetId: vmId,
      command: "echo hello",
    });
    expect(cmd.status).toBe("queued");

    const done = await runQueuedCommand(WS, cmd.id);
    expect(done.status).toBe("done");
    expect(done.exitCode).toBe(0);
    expect(done.stdout).toBe("hello\n");
    expect(done.startedAt).toBeTruthy();
    expect(done.finishedAt).toBeTruthy();
  });

  it("prefixes cwd when provided", async () => {
    const vmId = await makeVM();
    mockedSshExec.mockResolvedValue({ stdout: "", stderr: "", code: 0 });
    const cmd = await createRunnerCommand({
      workspaceId: WS,
      targetKind: "cloud_vm",
      targetId: vmId,
      command: "ls",
      cwd: "/srv/app",
    });
    await runQueuedCommand(WS, cmd.id);
    expect(mockedSshExec.mock.calls[0][1]).toBe("cd '/srv/app' && ls");
  });

  it("marks failed on transport error", async () => {
    const vmId = await makeVM();
    mockedSshExec.mockRejectedValue(new Error("connection refused"));
    const cmd = await runCommandOnVM({ workspaceId: WS, vmId, command: "boom" });
    expect(cmd.status).toBe("failed");
    expect(cmd.errorMessage).toContain("connection refused");
  });

  it("marks timeout when the exec times out", async () => {
    const vmId = await makeVM();
    mockedSshExec.mockRejectedValue(new Error("SSH command timed out after 120000ms: sleep"));
    const cmd = await runCommandOnVM({ workspaceId: WS, vmId, command: "sleep 999" });
    expect(cmd.status).toBe("timeout");
  });

  it("rejects a non-cloud_vm target for server-side execution", async () => {
    const cmd = await createRunnerCommand({
      workspaceId: WS,
      targetKind: "agent",
      targetId: "agent_1",
      command: "echo hi",
    });
    await expect(runQueuedCommand(WS, cmd.id)).rejects.toThrow(/cloud_vm/);
  });

  it("does not run a command from another workspace", async () => {
    const vmId = await makeVM();
    const cmd = await createRunnerCommand({
      workspaceId: WS,
      targetKind: "cloud_vm",
      targetId: vmId,
      command: "echo hi",
    });
    await expect(runQueuedCommand("ws_other", cmd.id)).rejects.toThrow(/not found/i);
  });

  it("capOutput truncates oversized output with a marker (pure)", () => {
    expect(capOutput(null)).toBeNull();
    expect(capOutput("short")).toBe("short");
    const big = "x".repeat(70_000);
    const capped = capOutput(big)!;
    expect(capped.length).toBeLessThan(big.length);
    expect(capped).toContain("truncated");
  });

  it("caps runaway stdout when persisting a result", async () => {
    const vmId = await makeVM();
    mockedSshExec.mockResolvedValue({ stdout: "y".repeat(200_000), stderr: "", code: 0 });
    const cmd = await runCommandOnVM({ workspaceId: WS, vmId, command: "spew" });
    expect(cmd.status).toBe("done");
    expect(cmd.stdout!.length).toBeLessThan(70_000);
    expect(cmd.stdout).toContain("truncated");
  });

  it("cancels a queued command", async () => {
    const vmId = await makeVM();
    const cmd = await createRunnerCommand({
      workspaceId: WS,
      targetKind: "cloud_vm",
      targetId: vmId,
      command: "echo hi",
    });
    expect(await cancelRunnerCommand(WS, cmd.id)).toBe(true);
    const row = await prisma.runnerCommand.findUniqueOrThrow({ where: { id: cmd.id } });
    expect(row.status).toBe("canceled");
    // a completed command cannot be canceled
    expect(await cancelRunnerCommand(WS, cmd.id)).toBe(false);
  });
});

describe("runner-commands GraphQL (Tier D)", () => {
  it("admin runs a command; result persisted; member denied; feature-gated", async () => {
    const vmId = await makeVM();
    mockedSshExec.mockResolvedValue({ stdout: "ok", stderr: "", code: 0 });
    await enableRunners();

    const run = await gql(
      `mutation($vmId:String!){ runCommandOnVm(vmId:$vmId, command:"echo ok"){ id status exitCode stdout } }`,
      { vmId },
    );
    expect(run.errors).toBeFalsy();
    expect(run.data.runCommandOnVm).toMatchObject({ status: "done", exitCode: 0, stdout: "ok" });

    const list = await gql(
      `query($vmId:String!){ runnerCommands(targetKind:"cloud_vm", targetId:$vmId){ id command status } }`,
      { vmId },
    );
    expect(list.data.runnerCommands).toHaveLength(1);

    // member cannot run
    const denied = await gql(
      `mutation($vmId:String!){ runCommandOnVm(vmId:$vmId, command:"echo x"){ id } }`,
      { vmId },
      "member",
    );
    expect(denied.errors).toBeDefined();

    // disable the flag → gated
    await prisma.featureFlag.upsert({
      where: { key: "runners" },
      create: { key: "runners", enabled: false, managedBy: "user" },
      update: { enabled: false },
    });
    invalidateFlagCache();
    const gated = await gql(`query($vmId:String!){ runnerCommands(targetId:$vmId){ id } }`, {
      vmId,
    });
    expect(gated.errors).toBeDefined();
  });
});
