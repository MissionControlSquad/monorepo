/**
 * Tier D / Phase 3 (Plan 6, this slice) — the SSH runtime transport for the unified environment driver.
 *
 * An `ssh` Environment names a remote host + a vaulted private key. This module turns that into a real,
 * executable {@link SandboxHandle} so the SAME run path (acquireLease → handle.exec → releaseLease) that
 * drives `local`/`sandbox` also drives `ssh` — the point of the unified {@link EnvironmentRuntimeDriver}
 * seam. The remote command is the SAME self-contained script `composeSandboxScript` builds for a sandbox;
 * we just run it over ssh in a per-run workspace dir instead of in a provisioned box.
 *
 * SECURITY:
 *   • Credentials come from the workspace secrets vault by secret-ref (resolved server-side, audited by
 *     the vault); never inlined into the Environment config or the command.
 *   • Injection-safe: the transport passes the ALREADY-composed script to the remote shell exactly like
 *     the `local` provider hands it to `sh -c` — user input (the task prompt) is heredoc-quoted and every
 *     secret value is `shq`-quoted upstream in `composeSandboxScript`. The transport itself only prefixes
 *     a `cd <shellQuote(workdir)>`; it never string-concatenates untrusted input into new shell syntax.
 *
 * TESTABILITY: the actual byte transport is an injectable seam ({@link SshExecTransport}). The default
 * implementation streams over a real ssh2 connection ({@link defaultSshExecTransport}); tests inject a
 * fake that returns a canned {@link SandboxExecResult} and drives `onLog`, so the driver wiring + result
 * shaping + redaction are proven WITHOUT a real remote host.
 */
import { randomUUID } from "node:crypto";
import { isSecretRef } from "@agentcenter/utils";
import { sshExecStream } from "../ssh";
import { resolveWorkspaceSecret } from "../secrets";
import {
  shellQuote,
  withCwd,
  type SandboxExecResult,
  type SandboxHandle,
  type SandboxLogChunk,
  type SandboxProvider,
} from "./types";

/** The (secret-resolved) connection details one ssh exec needs. `privateKey` is plaintext, in-memory. */
export interface SshConnection {
  host: string;
  port: number;
  username: string;
  privateKey: string;
}

/**
 * The persisted, NON-secret ssh transport shape carried on an environment execution resolution: host +
 * port + username, plus the private-key descriptor (a vault secret-ref, or a legacy inline string). The
 * key VALUE is only ever resolved server-side at run/probe time via {@link resolveSshConnection}.
 */
export interface EnvSshResolution {
  host: string;
  port: number;
  username: string;
  privateKey?: string | { secretRef: { name: string } };
}

/**
 * Injectable transport seam: run ONE command over ssh, stream its output through `onLog`, and shape the
 * captured result. The default implementation uses a real ssh2 connection; tests inject a fake.
 */
export type SshExecTransport = (args: {
  connection: SshConnection;
  command: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onLog?: (chunk: SandboxLogChunk) => void;
}) => Promise<SandboxExecResult>;

/**
 * Resolve an environment's ssh private key from the vault (secret-ref) or a legacy inline string. Returns
 * null when there is no key (or the secret is absent) — the pre-dispatch config gate turns that into a
 * `configuration_incomplete` refusal rather than a mid-run connect failure.
 */
export async function resolveSshPrivateKey(
  workspaceId: string,
  ssh: EnvSshResolution | null | undefined,
): Promise<string | null> {
  if (!ssh) return null;
  const pk = ssh.privateKey;
  if (isSecretRef(pk)) {
    return await resolveWorkspaceSecret(workspaceId, pk.secretRef.name);
  }
  if (typeof pk === "string" && pk.trim()) return pk;
  return null;
}

/** Resolve the full ssh connection (key from the vault). `privateKey` is "" when unresolved (gate-caught). */
export async function resolveSshConnection(
  workspaceId: string,
  ssh: EnvSshResolution,
): Promise<SshConnection> {
  const privateKey = (await resolveSshPrivateKey(workspaceId, ssh)) ?? "";
  return {
    host: ssh.host,
    port: ssh.port,
    username: ssh.username,
    privateKey,
  };
}

/**
 * Default ssh transport: open a streaming ssh2 exec, forward each chunk to `onLog`, and resolve a
 * structured {@link SandboxExecResult}. Honors a timeout budget and an in-flight AbortSignal by ending
 * the ssh client (parity with the `local` provider's SIGKILL) and shaping the result as timedOut/aborted.
 */
export const defaultSshExecTransport: SshExecTransport = async ({
  connection,
  command,
  timeoutMs,
  signal,
  onLog,
}) => {
  let stdout = "";
  let stderr = "";
  const handle = await sshExecStream(
    connection,
    command,
    (chunk) => {
      stdout += chunk;
      onLog?.({ stream: "stdout", data: chunk });
    },
    (chunk) => {
      stderr += chunk;
      onLog?.({ stream: "stderr", data: chunk });
    },
  );

  return await new Promise<SandboxExecResult>((resolve) => {
    let settled = false;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    };
    const done = (res: SandboxExecResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(res);
    };
    const timer =
      timeoutMs && timeoutMs > 0
        ? setTimeout(() => {
            handle.client.end();
            done({
              exitCode: null,
              stdout,
              stderr: stderr + "\n…[killed: exceeded timeout]",
              timedOut: true,
            });
          }, timeoutMs)
        : undefined;
    const onAbort = () => {
      handle.client.end();
      done({
        exitCode: null,
        stdout,
        stderr: stderr + "\n…[killed: run canceled]",
        aborted: true,
      });
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
    handle.done
      .then((code) => done({ exitCode: code, stdout, stderr, signal: null }))
      .catch((err) => done({ exitCode: null, stdout, stderr: stderr + String(err) }));
  });
};

/**
 * Build a {@link SandboxProvider} that executes over ssh — the ssh arm of the unified environment driver.
 * `provision` creates a per-run remote workspace dir (realize), `exec` runs the composed script there and
 * streams output (exec), `destroy` removes the dir (release). Same contract as every other provider, so
 * the lease layer + run finalizer are unchanged. `isolating: true` — a remote host is off the
 * control-plane host, so a low-trust agent may target it (fail-closed admission still applies).
 */
export function buildSshRuntimeProvider(opts: {
  connection: SshConnection;
  transport?: SshExecTransport;
}): SandboxProvider {
  const transport = opts.transport ?? defaultSshExecTransport;
  const { connection } = opts;
  return {
    key: "ssh",
    displayName: `SSH (${connection.username}@${connection.host})`,
    requiresApiKey: false,
    credentialKeys: [],
    isolating: true,
    provision: async () => {
      const workdir = `/tmp/agentcenter-run-${randomUUID()}`;
      // Realize: create the remote workspace dir. A connect failure here surfaces as a run failure.
      await transport({ connection, command: `mkdir -p ${shellQuote(workdir)}` });
      const handle: SandboxHandle = {
        id: workdir,
        providerKey: "ssh",
        exec: (command, execOpts) =>
          transport({
            connection,
            // Run the composed script in the run's remote workspace dir. `command` is already a
            // fully-quoted, self-contained script (see composeSandboxScript); we only prefix the cd.
            command: withCwd(command, execOpts?.cwd ?? workdir),
            timeoutMs: execOpts?.timeoutMs,
            signal: execOpts?.signal,
            onLog: execOpts?.onLog,
          }),
        destroy: async () => {
          try {
            await transport({ connection, command: `rm -rf ${shellQuote(workdir)}` });
          } catch {
            // best-effort remote cleanup — never fail a run because teardown failed
          }
        },
      };
      return handle;
    },
  };
}
