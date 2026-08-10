/**
 * exe.dev sandbox provider — ported from Paperclip's exe-dev plugin. NOT an SDK: VM lifecycle is a
 * plain-text CLI command POSTed to https://exe.dev/exec (Bearer apiKey), and command execution is a
 * local `ssh` subprocess to the VM (a SEPARATE credential — an SSH key registered with exe.dev).
 * Provision: POST `new --json --name=… --setup-script=…` → VM record {name, ssh_dest}. Exec: spawn
 * ssh -i <key> user@ssh_dest 'sh -c <script>'. Destroy: POST `rm --json <name>`.
 */
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defineCloudProvider,
  loginShellCommand,
  shellQuote,
  type SandboxExecResult,
  type SandboxHandle,
} from "./types";
import { guardedFetch } from "@agentcenter/utils/remote-http-endpoint-guard";

const DEFAULT_API_URL = "https://exe.dev/exec";
// Install Node 20 so an agent runtime bridge can run (mirrors Paperclip's DEFAULT_SETUP_SCRIPT).
const DEFAULT_SETUP_SCRIPT =
  "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs";

interface ExeVmRecord {
  name: string;
  sshDest: string;
}

function normalizeApiUrl(raw?: string): string {
  const url = (raw || DEFAULT_API_URL).trim().replace(/\/+$/, "");
  return url.endsWith("/exec") ? url : `${url}/exec`;
}

async function runLifecycleCommand(
  apiUrl: string,
  apiKey: string,
  command: string,
): Promise<string> {
  // SSRF guard: apiUrl is workspace-configured (EXE_DEV_API_URL). Blocks private/reserved targets
  // unless SSRF_ALLOW_PRIVATE_NETWORK=1 (self-hosted internal bridge).
  const res = await guardedFetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: command,
    signal: AbortSignal.timeout(29_000), // exe.dev API caps at ~29s
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`exe.dev API error (${res.status}): ${text.slice(0, 500)}`);
  }
  return text;
}

function parseVmRecord(json: string, fallbackName: string): ExeVmRecord {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    // fall through to defaults
  }
  const name = String(parsed.vm_name ?? parsed.name ?? parsed.vmName ?? fallbackName);
  const sshDest = String(parsed.ssh_dest ?? parsed.sshDest ?? `${name}.exe.xyz`);
  return { name, sshDest };
}

function runSsh(
  keyFile: string | undefined,
  user: string,
  sshDest: string,
  remoteCommand: string,
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<SandboxExecResult> {
  return new Promise((resolve) => {
    const args = [
      "-T",
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "ConnectTimeout=15",
    ];
    if (keyFile) args.push("-i", keyFile, "-o", "IdentitiesOnly=yes");
    args.push(`${user}@${sshDest}`, remoteCommand);
    const child = spawn("ssh", args);
    let stdout = "";
    let stderr = "";
    let aborted = false;
    const timer = opts?.timeoutMs
      ? setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs)
      : undefined;
    // In-flight cancellation (§3 #2): abort kills the ssh subprocess (which closes the remote command's
    // channel). Best-effort — the remote process may briefly outlive the channel, but the run is freed.
    const onAbort = () => {
      aborted = true;
      child.kill("SIGKILL");
    };
    if (opts?.signal) {
      if (opts.signal.aborted) queueMicrotask(onAbort);
      else opts.signal.addEventListener("abort", onAbort, { once: true });
    }
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (opts?.signal) opts.signal.removeEventListener("abort", onAbort);
    };
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => {
      cleanup();
      resolve({ exitCode: null, stdout, stderr: stderr + String(err), aborted });
    });
    child.on("close", (code) => {
      cleanup();
      resolve({ exitCode: code, stdout, stderr, aborted });
    });
  });
}

export const exeDevProvider = defineCloudProvider({
  key: "exe-dev",
  displayName: "exe.dev",
  credentialKeys: ["EXE_DEV_API_KEY"],
  provision: async (creds, ctx, spec): Promise<SandboxHandle> => {
    const apiUrl = normalizeApiUrl((await ctx.resolveSecret("EXE_DEV_API_URL")) || undefined);
    const apiKey = creds.EXE_DEV_API_KEY;
    const vmName =
      `agentcenter-${Math.abs(hashCode(String(process.hrtime.bigint()))).toString(36)}`.slice(
        0,
        63,
      );
    const parts = [
      "new --json --no-email",
      `--name=${shellQuote(vmName)}`,
      `--setup-script=${shellQuote(DEFAULT_SETUP_SCRIPT)}`,
    ];
    if (spec?.image) parts.push(`--image=${shellQuote(spec.image)}`);
    const record = parseVmRecord(
      await runLifecycleCommand(apiUrl, apiKey, parts.join(" ")),
      vmName,
    );

    // SSH key (separate from the API token) — required for exec, optional for provision/destroy.
    let keyDir: string | undefined;
    let keyFile: string | undefined;
    const sshKey = (await ctx.resolveSecret("EXE_DEV_SSH_KEY"))?.trim();
    if (sshKey) {
      keyDir = mkdtempSync(join(tmpdir(), "agentcenter-exe-"));
      keyFile = join(keyDir, "id_ed25519");
      writeFileSync(keyFile, sshKey + "\n");
      chmodSync(keyFile, 0o600);
    }
    const sshUser = (await ctx.resolveSecret("EXE_DEV_SSH_USER")) || "root";

    return {
      id: record.name,
      providerKey: "exe-dev",
      exec: async (command, opts) => {
        if (!keyFile) {
          throw new Error(
            "exe.dev exec requires an SSH key registered with exe.dev — set EXE_DEV_SSH_KEY.",
          );
        }
        const script = loginShellCommand(command, opts?.cwd);
        return runSsh(keyFile, sshUser, record.sshDest, `sh -c ${shellQuote(script)}`, {
          timeoutMs: opts?.timeoutMs,
          signal: opts?.signal,
        });
      },
      destroy: async () => {
        try {
          await runLifecycleCommand(apiUrl, apiKey, `rm --json ${shellQuote(record.name)}`);
        } finally {
          if (keyDir) rmSync(keyDir, { recursive: true, force: true });
        }
      },
    };
  },
});

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
