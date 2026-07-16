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
 * Credentials are per-DEPLOYMENT env vars (the operator owns them + bills users), same model as
 * HETZNER_API_TOKEN — NOT a per-workspace vault.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  SandboxExecResult,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
} from "./sandbox/types";
import { e2bProvider } from "./sandbox/e2b";
import { daytonaProvider } from "./sandbox/daytona";
import { modalProvider } from "./sandbox/modal";
import { novitaProvider } from "./sandbox/novita";
import { cloudflareProvider } from "./sandbox/cloudflare";
import { kubernetesProvider } from "./sandbox/kubernetes";
import { exeDevProvider } from "./sandbox/exe-dev";

export type { SandboxExecResult, SandboxHandle, SandboxProvider, SandboxSpec };

/** Is this provider configured on THIS deployment? (all its credential env keys present + non-empty). */
export function isSandboxProviderConfigured(
  provider: SandboxProvider,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (provider.credentialEnvKeys.length === 0) return true; // local — no keys needed
  return provider.credentialEnvKeys.every((k) => !!env[k]?.trim());
}

// ─── local reference provider (real, no keys) ────────────────────────────────

function runLocal(command: string, cwd: string, timeoutMs?: number): Promise<SandboxExecResult> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command], { cwd });
    let stdout = "";
    let stderr = "";
    const timer = timeoutMs ? setTimeout(() => child.kill("SIGKILL"), timeoutMs) : undefined;
    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr: stderr + String(err) });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}

const localProvider: SandboxProvider = {
  key: "local",
  displayName: "Local (this host)",
  requiresApiKey: false,
  credentialEnvKeys: [],
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
