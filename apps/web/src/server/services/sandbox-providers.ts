/**
 * Tier D: sandbox provider registry — parity with Paperclip's sandbox-providers (e2b/daytona/modal/
 * novita/cloudflare/kubernetes/exe-dev). A sandbox provider provisions an ephemeral machine to run a
 * task on, exposes an `exec`, and tears it down.
 *
 * `local` is the reference provider — real, no keys (a temp dir + child_process), and what the tests
 * exercise. The seven cloud providers port the CORE provision→exec→destroy calls from the real
 * Paperclip plugins (see each file under ./sandbox). Their vendor SDKs are heavy + optional, so each
 * loads its module at runtime and is typed against a locally-declared minimal interface — typecheck
 * passes without installing them, and a missing credential OR a missing SDK throws a clear, actionable
 * error. Nothing is faked to look like it works.
 *
 * Credentials are BYO: each cloud provider reads its keys from the caller's WORKSPACE secrets vault
 * (resolved by name), never from deployment env — the customer owns the key + bills to their own
 * provider account. Pure bring-your-own-infra; there is no operator-owned credential tier.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  SandboxExecResult,
  SandboxHandle,
  SandboxProvider,
  SandboxProvisionContext,
  SandboxSecretResolver,
  SandboxSpec,
} from "./sandbox/types";
import { e2bProvider } from "./sandbox/e2b";
import { daytonaProvider } from "./sandbox/daytona";
import { modalProvider } from "./sandbox/modal";
import { novitaProvider } from "./sandbox/novita";
import { cloudflareProvider } from "./sandbox/cloudflare";
import { kubernetesProvider } from "./sandbox/kubernetes";
import { exeDevProvider } from "./sandbox/exe-dev";

export type {
  SandboxExecResult,
  SandboxHandle,
  SandboxProvider,
  SandboxProvisionContext,
  SandboxSecretResolver,
  SandboxSpec,
};

/**
 * Is this provider configured for a workspace? (all its credential secret names resolve to a non-empty
 * value in that workspace's vault). `local` needs nothing. Async because it reads the vault.
 */
export async function isSandboxProviderConfigured(
  provider: SandboxProvider,
  resolveSecret: SandboxSecretResolver,
): Promise<boolean> {
  if (provider.credentialKeys.length === 0) return true; // local — no keys needed
  for (const name of provider.credentialKeys) {
    const value = (await resolveSecret(name))?.trim();
    if (!value) return false;
  }
  return true;
}

// ─── local reference provider (real, no keys) ────────────────────────────────

// Bound in-memory capture so a runaway command can't OOM the host running the local sandbox.
const MAX_CAPTURE_BYTES = 1_000_000;

function runLocal(command: string, cwd: string, timeoutMs?: number): Promise<SandboxExecResult> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command], { cwd });
    let stdout = "";
    let stderr = "";
    let outDropped = 0;
    let errDropped = 0;
    const timer = timeoutMs ? setTimeout(() => child.kill("SIGKILL"), timeoutMs) : undefined;
    child.stdout?.on("data", (d: Buffer) => {
      if (stdout.length < MAX_CAPTURE_BYTES) stdout += d.toString();
      else outDropped += d.length;
    });
    child.stderr?.on("data", (d: Buffer) => {
      if (stderr.length < MAX_CAPTURE_BYTES) stderr += d.toString();
      else errDropped += d.length;
    });
    const cap = (s: string, dropped: number) =>
      dropped > 0 ? `${s}\n…[truncated ${dropped} bytes]` : s;
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({
        exitCode: null,
        stdout: cap(stdout, outDropped),
        stderr: cap(stderr, errDropped) + String(err),
      });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ exitCode: code, stdout: cap(stdout, outDropped), stderr: cap(stderr, errDropped) });
    });
  });
}

const localProvider: SandboxProvider = {
  key: "local",
  displayName: "Local (this host)",
  requiresApiKey: false,
  credentialKeys: [],
  isolating: false, // runs on the control-plane host — NOT for untrusted/low-trust agents

  provision: async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentcenter-sbx-"));
    return {
      id: dir,
      providerKey: "local",
      exec: (command, opts) => runLocal(command, opts?.cwd ?? dir, opts?.timeoutMs),
      destroy: async () => {
        rmSync(dir, { recursive: true, force: true });
      },
    };
  },
};

// ─── registry ────────────────────────────────────────────────────────────────

const CLOUD_PROVIDERS: SandboxProvider[] = [
  e2bProvider,
  daytonaProvider,
  modalProvider,
  novitaProvider,
  cloudflareProvider,
  kubernetesProvider,
  exeDevProvider,
];

const registry = new Map<string, SandboxProvider>(
  [localProvider, ...CLOUD_PROVIDERS].map((p) => [p.key, p]),
);

/** Register (or override) a sandbox provider — the seam for wiring a custom cloud SDK. */
export function registerSandboxProvider(provider: SandboxProvider): void {
  registry.set(provider.key, provider);
}
export function getSandboxProvider(key: string): SandboxProvider | undefined {
  return registry.get(key);
}
export function listSandboxProviders(): SandboxProvider[] {
  return [...registry.values()];
}
export const SANDBOX_PROVIDER_KEYS = [localProvider, ...CLOUD_PROVIDERS].map((p) => p.key);
