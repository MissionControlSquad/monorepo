import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../../src/server/prisma";
import { hashApiKey } from "../../src/server/api-key";
import { agentCache } from "../../src/server/cache";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import { runTaskInSandbox } from "../../src/server/services/sandbox-run";
import { createEnvironment } from "../../src/server/services/environments";
import { resolveEnvironmentExecution } from "../../src/server/services/environments";
import { createSecret, bindSecret } from "../../src/server/services/secrets";
import { getRunRuntimeStatus } from "../../src/server/services/run-runtime-status";
import type { SshExecTransport } from "../../src/server/services/sandbox/ssh-runtime";

// Tier D — the unified EnvironmentRuntimeDriver + the ssh runtime round-trip + the pre-dispatch config
// gate. The ssh transport is INJECTED (a fake exec), so an ssh Environment round-trips through the run
// path WITHOUT a real remote host — proving driver wiring, result shaping, streaming, and redaction.
const WS = "ws_envdriver";

async function setFlag(key: string, enabled: boolean) {
  await prisma.featureFlag.upsert({
    where: { key },
    create: { key, enabled, managedBy: "user" },
    update: { enabled },
  });
  invalidateFlagCache();
}

async function makeTask(): Promise<string> {
  const task = await prisma.task.create({
    data: {
      title: "Ship it",
      description: "deploy",
      status: "assigned",
      priority: "high",
      tags: [],
    },
  });
  return task.id;
}

async function agentInEnv(environmentId: string, template = "echo SANDBOX_RAN"): Promise<string> {
  const agent = await prisma.agent.create({
    data: {
      name: "Env Agent",
      role: "worker",
      personality: "diligent",
      workspaceId: WS,
      setupStatus: "active",
      apiKeyHash: hashApiKey(`mc_envdrv_${Math.random()}`),
      runtimeAdapter: "shell",
      runtimeTemplate: template,
      environmentId,
    },
  });
  return agent.id;
}

/**
 * A fake ssh exec transport: it answers the realize (`mkdir`) + release (`rm -rf`) calls trivially, and
 * for the run script it streams the canned output through onLog and returns a structured result. This is
 * the seam that lets the round-trip be proven without a real host.
 */
function fakeSsh(opts: {
  stdout: string;
  stderr?: string;
  exitCode?: number;
  onExec?: (command: string) => void;
}): SshExecTransport {
  return async ({ command, onLog }) => {
    // The run script is the exec whose cwd (a /tmp/agentcenter-run-* workspace dir) is prefixed by the
    // transport; the realize (`mkdir`) + release (`rm -rf`) calls target that dir directly. Only the run
    // script produces output. (The composed script itself contains `mkdir -p workspace`, so we must key
    // on the cd prefix, not a bare "mkdir".)
    if (!command.startsWith("cd '/tmp/agentcenter-run-")) {
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    opts.onExec?.(command);
    onLog?.({ stream: "stdout", data: opts.stdout });
    if (opts.stderr) onLog?.({ stream: "stderr", data: opts.stderr });
    return {
      exitCode: opts.exitCode ?? 0,
      stdout: opts.stdout,
      stderr: opts.stderr ?? "",
      timedOut: false,
    };
  };
}

beforeEach(async () => {
  agentCache.clear();
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE agent_runs, messages, tasks, agents, profiles, environments, environment_leases, secrets CASCADE`,
  );
  await setFlag("environments", true);
  await setFlag("execution_policy", true);
});

// Reset the flags this suite flips so they never leak `true` into unrelated suites (shared test DB).
afterAll(async () => {
  await setFlag("environments", false);
  await setFlag("execution_policy", false);
});

describe("unified driver routing per env kind", () => {
  it("resolves local/sandbox/ssh to real executable transports (ssh no longer providerKey:null)", async () => {
    const local = await createEnvironment(WS, { name: "Loc", driver: "local" });
    const sandbox = await createEnvironment(WS, {
      name: "Sbx",
      driver: "sandbox",
      config: { provider: "local" },
    });
    const ssh = await createEnvironment(WS, {
      name: "Ssh",
      driver: "ssh",
      config: { host: "1.2.3.4", privateKey: { secretRef: { name: "SSH_KEY" } } },
    });

    expect(await resolveEnvironmentExecution(WS, local.id)).toMatchObject({
      driver: "local",
      providerKey: "local",
    });
    expect(await resolveEnvironmentExecution(WS, sandbox.id)).toMatchObject({
      driver: "sandbox",
      providerKey: "local",
    });
    const sshRes = await resolveEnvironmentExecution(WS, ssh.id);
    expect(sshRes).toMatchObject({ driver: "ssh", providerKey: "ssh" });
    // the ssh transport descriptor is carried (host/port/username + key ref), key value NOT inlined.
    expect(sshRes?.ssh).toMatchObject({ host: "1.2.3.4", port: 22, username: "root" });
  });
});

describe("ssh runtime round-trip (injected transport)", () => {
  it("routes a run through the ssh driver, streams output, shapes the result, and redacts secrets", async () => {
    await createSecret({
      workspaceId: WS,
      name: "SSH_KEY",
      value: "PRIVATE_KEY_PEM",
      createdBy: "h",
    });
    const env = await createEnvironment(WS, {
      name: "Prod host",
      driver: "ssh",
      config: {
        host: "10.0.0.9",
        username: "deploy",
        privateKey: { secretRef: { name: "SSH_KEY" } },
      },
    });
    const agentId = await agentInEnv(env.id, "echo SANDBOX_RAN && echo secret=$MY_SECRET");
    // Bind an agent secret whose VALUE the remote command echoes — it must be scrubbed from every sink.
    const secret = await createSecret({
      workspaceId: WS,
      name: "MY_SECRET",
      value: "sk-ssh-topsecret",
      createdBy: "h",
    });
    await bindSecret({
      workspaceId: WS,
      secretId: secret.id,
      scope: "agent",
      agentId,
      envVarName: "MY_SECRET",
      createdBy: "h",
    });
    const taskId = await makeTask();

    let ranScript = "";
    const result = await runTaskInSandbox({
      workspaceId: WS,
      taskId,
      agentId,
      // The fake echoes the secret VALUE the way the real remote runtime would, so redaction is exercised.
      sshExec: fakeSsh({
        stdout: "SANDBOX_RAN\nsecret=sk-ssh-topsecret\n",
        onExec: (cmd) => (ranScript = cmd),
      }),
    });

    // The run ran through the ssh transport (providerKey "ssh") and captured the streamed output.
    expect(result.providerKey).toBe("ssh");
    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("review");
    expect(result.stdout).toContain("SANDBOX_RAN");
    // Redaction: the resolved secret VALUE never survives into the returned/persisted output.
    expect(result.stdout).not.toContain("sk-ssh-topsecret");
    // The remote command was the composed script (with the secret exported), run in the remote workspace
    // dir (cd prefix applied by the transport).
    expect(ranScript).toContain("cd '/tmp/agentcenter-run-");
    expect(ranScript).toContain("echo SANDBOX_RAN");
    expect(ranScript).toContain("export MY_SECRET='sk-ssh-topsecret'");

    // Persisted ledger row reflects the ssh run + redacted stdout.
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: result.runId } });
    expect(run).toMatchObject({ kind: "sandbox", providerKey: "ssh", status: "done", exitCode: 0 });
    expect(run.stdout ?? "").not.toContain("sk-ssh-topsecret");

    // Live tail streamed + redacted (the secret value never survives into the live status either).
    const live = getRunRuntimeStatus(result.runId);
    expect(live?.tail).toContain("SANDBOX_RAN");
    expect(live?.tail ?? "").not.toContain("sk-ssh-topsecret");
  });

  it("shapes a non-zero ssh exit as a blocked/failed run", async () => {
    await createSecret({
      workspaceId: WS,
      name: "SSH_KEY",
      value: "PRIVATE_KEY_PEM",
      createdBy: "h",
    });
    const env = await createEnvironment(WS, {
      name: "Host",
      driver: "ssh",
      config: { host: "10.0.0.9", privateKey: { secretRef: { name: "SSH_KEY" } } },
    });
    const agentId = await agentInEnv(env.id);
    const taskId = await makeTask();

    const result = await runTaskInSandbox({
      workspaceId: WS,
      taskId,
      agentId,
      sshExec: fakeSsh({ stdout: "boom\n", stderr: "fatal\n", exitCode: 3 }),
    });
    expect(result.exitCode).toBe(3);
    expect(result.status).toBe("blocked");
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: result.runId } })).status).toBe(
      "failed",
    );
  });

  it("ssh stays not-runnable when ENVIRONMENTS is off (back-compat)", async () => {
    await setFlag("environments", false);
    const env = await createEnvironment(WS, {
      name: "Host",
      driver: "ssh",
      config: { host: "10.0.0.9", privateKey: { secretRef: { name: "SSH_KEY" } } },
    });
    const agentId = await agentInEnv(env.id);
    const taskId = await makeTask();
    await expect(
      runTaskInSandbox({ workspaceId: WS, taskId, agentId, sshExec: fakeSsh({ stdout: "" }) }),
    ).rejects.toThrow(/not yet runnable/i);
  });
});

describe("pre-dispatch config/binding gate (configuration_incomplete)", () => {
  it("refuses an ssh run whose private key is not bound (marks the run configuration_incomplete)", async () => {
    // ssh env with a host but NO privateKey binding.
    const env = await createEnvironment(WS, {
      name: "Unbound host",
      driver: "ssh",
      config: { host: "10.0.0.9" },
    });
    const agentId = await agentInEnv(env.id);
    const taskId = await makeTask();

    await expect(
      runTaskInSandbox({ workspaceId: WS, taskId, agentId, sshExec: fakeSsh({ stdout: "" }) }),
    ).rejects.toThrow(/needs configuration/i);

    const run = await prisma.agentRun.findFirstOrThrow({ where: { agentId, taskId } });
    expect(run.status).toBe("failed");
    expect(run.exitReason).toBe("configuration_incomplete");
    expect(run.errorMessage).toMatch(/SSH private key/i);
  });

  it("refuses a sandbox run whose provider credentials are missing", async () => {
    const env = await createEnvironment(WS, {
      name: "e2b box",
      driver: "sandbox",
      config: { provider: "e2b" }, // requires E2B_API_KEY in the vault — not present
    });
    const agentId = await agentInEnv(env.id);
    const taskId = await makeTask();

    await expect(runTaskInSandbox({ workspaceId: WS, taskId, agentId })).rejects.toThrow(
      /needs configuration/i,
    );
    const run = await prisma.agentRun.findFirstOrThrow({ where: { agentId, taskId } });
    expect(run.exitReason).toBe("configuration_incomplete");
    expect(run.errorMessage).toMatch(/e2b/i);
  });

  it("allows a fully-configured run (gate passes → the ssh round-trip proceeds)", async () => {
    await createSecret({
      workspaceId: WS,
      name: "SSH_KEY",
      value: "PRIVATE_KEY_PEM",
      createdBy: "h",
    });
    const env = await createEnvironment(WS, {
      name: "Ready host",
      driver: "ssh",
      config: { host: "10.0.0.9", privateKey: { secretRef: { name: "SSH_KEY" } } },
    });
    const agentId = await agentInEnv(env.id);
    const taskId = await makeTask();

    const result = await runTaskInSandbox({
      workspaceId: WS,
      taskId,
      agentId,
      sshExec: fakeSsh({ stdout: "SANDBOX_RAN\n" }),
    });
    expect(result.exitCode).toBe(0);
    expect(
      (await prisma.agentRun.findUniqueOrThrow({ where: { id: result.runId } })).exitReason,
    ).not.toBe("configuration_incomplete");
  });

  it("does not gate when EXECUTION_POLICY is off (a missing binding fails later, not pre-dispatch)", async () => {
    await setFlag("execution_policy", false);
    const env = await createEnvironment(WS, {
      name: "Unbound host",
      driver: "ssh",
      config: { host: "10.0.0.9" }, // no key
    });
    const agentId = await agentInEnv(env.id);
    const taskId = await makeTask();
    // With the gate off, the run is NOT refused for configuration_incomplete pre-dispatch; the injected
    // transport lets it complete (a real host would fail at connect — that's the mid-run failure the gate
    // is designed to prevent when enabled).
    const result = await runTaskInSandbox({
      workspaceId: WS,
      taskId,
      agentId,
      sshExec: fakeSsh({ stdout: "ok\n" }),
    });
    expect(result.exitCode).toBe(0);
    expect(
      (await prisma.agentRun.findUniqueOrThrow({ where: { id: result.runId } })).exitReason,
    ).not.toBe("configuration_incomplete");
  });
});
