import { describe, it, expect } from "vitest";
import {
  buildSshRuntimeProvider,
  type SshExecTransport,
} from "../../src/server/services/sandbox/ssh-runtime";
import type { SandboxLogChunk } from "../../src/server/services/sandbox/types";

// Unit: the ssh runtime driver's provider wiring, proven with an INJECTED fake transport (no real host).
// This asserts the realize/exec/release contract + streaming + result passthrough the run path relies on.

const connection = { host: "1.2.3.4", port: 22, username: "deploy", privateKey: "PRIVATE_KEY" };

describe("buildSshRuntimeProvider (injected transport)", () => {
  it("realizes a remote workspace dir, execs the composed script in it, and shapes the result", async () => {
    const calls: { command: string; onLog?: unknown }[] = [];
    const transport: SshExecTransport = async ({ command, onLog }) => {
      calls.push({ command, onLog });
      // Stream two chunks the way a real exec would, then return a structured result.
      onLog?.({ stream: "stdout", data: "SSH_RAN\n" });
      onLog?.({ stream: "stderr", data: "warn\n" });
      return { exitCode: 0, stdout: "SSH_RAN\n", stderr: "warn\n", timedOut: false };
    };

    const provider = buildSshRuntimeProvider({ connection, transport });
    expect(provider.key).toBe("ssh");
    expect(provider.isolating).toBe(true);

    const handle = await provider.provision({
      workspaceId: "ws",
      resolveSecret: async () => null,
    });
    // provision → a `mkdir -p <workdir>` realize call, and the handle id IS that remote workdir.
    expect(calls[0].command).toMatch(/^mkdir -p '\/tmp\/agentcenter-run-/);
    expect(handle.id).toMatch(/^\/tmp\/agentcenter-run-/);
    expect(handle.providerKey).toBe("ssh");

    const streamed: SandboxLogChunk[] = [];
    const result = await handle.exec("echo SSH_RAN", { onLog: (c) => streamed.push(c) });

    // exec runs the script prefixed with a `cd <workdir> &&` (cwd applied by the transport).
    const execCall = calls[1];
    expect(execCall.command).toContain("cd '/tmp/agentcenter-run-");
    expect(execCall.command).toContain("&& echo SSH_RAN");
    // result is passed through untouched (shaping happens in the transport / run finalizer).
    expect(result).toMatchObject({ exitCode: 0, stdout: "SSH_RAN\n", stderr: "warn\n" });
    // streaming reached the caller's onLog.
    expect(streamed).toEqual([
      { stream: "stdout", data: "SSH_RAN\n" },
      { stream: "stderr", data: "warn\n" },
    ]);

    await handle.destroy();
    // release → a best-effort `rm -rf <workdir>`.
    expect(calls[2].command).toMatch(/^rm -rf '\/tmp\/agentcenter-run-/);
  });

  it("forwards timeout + abort signal to the transport", async () => {
    let sawTimeout: number | undefined;
    let sawSignal: AbortSignal | undefined;
    const transport: SshExecTransport = async ({ command, timeoutMs, signal }) => {
      if (command.includes("mkdir")) return { exitCode: 0, stdout: "", stderr: "" };
      sawTimeout = timeoutMs;
      sawSignal = signal;
      return { exitCode: null, stdout: "", stderr: "", timedOut: true };
    };
    const provider = buildSshRuntimeProvider({ connection, transport });
    const handle = await provider.provision({ workspaceId: "ws", resolveSecret: async () => null });
    const ac = new AbortController();
    const res = await handle.exec("sleep 99", { timeoutMs: 1234, signal: ac.signal });
    expect(sawTimeout).toBe(1234);
    expect(sawSignal).toBe(ac.signal);
    expect(res.timedOut).toBe(true);
  });
});
