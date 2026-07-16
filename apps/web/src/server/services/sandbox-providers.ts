/**
 * Tier D: sandbox provider abstraction — parity with Paperclip's sandbox-providers (e2b/daytona/
 * modal/novita/cloudflare/kubernetes/exe-dev). A sandbox provider provisions an ephemeral machine to
 * run a task on, exposes an exec, and tears it down.
 *
 * HONEST BOUNDARY: the `local` provider is real and runs with no keys (a temp dir + child_process) —
 * it's the reference implementation + what the tests exercise. The seven cloud providers are
 * registered as first-class options but their provision() throws a clear "not configured — needs API
 * key + SDK" until wired against the real SDK. They are NOT faked to look like they work.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface SandboxSpec {
  image?: string;
  region?: string;
}
export interface SandboxExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}
export interface SandboxHandle {
  id: string;
  providerKey: string;
  exec(command: string, opts?: { cwd?: string; timeoutMs?: number }): Promise<SandboxExecResult>;
  destroy(): Promise<void>;
}
export interface SandboxProvider {
  key: string;
  displayName: string;
  /** true → provision() needs a configured API key + SDK (not runnable in this environment). */
  requiresApiKey: boolean;
  provision(spec?: SandboxSpec): Promise<SandboxHandle>;
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

// ─── cloud providers (registered; require API key + SDK to provision) ────────

function cloudStub(key: string, displayName: string): SandboxProvider {
  return {
    key,
    displayName,
    requiresApiKey: true,
    provision: async () => {
      throw new Error(
        `${displayName} sandbox provider is not configured — set its API key + install the ${key} SDK to enable provisioning.`,
      );
    },
  };
}

const CLOUD_PROVIDERS: SandboxProvider[] = [
  cloudStub("e2b", "E2B"),
  cloudStub("daytona", "Daytona"),
  cloudStub("modal", "Modal"),
  cloudStub("novita", "Novita"),
  cloudStub("cloudflare", "Cloudflare"),
  cloudStub("kubernetes", "Kubernetes"),
  cloudStub("exe-dev", "exe.dev"),
];

// ─── registry ────────────────────────────────────────────────────────────────

const registry = new Map<string, SandboxProvider>(
  [localProvider, ...CLOUD_PROVIDERS].map((p) => [p.key, p]),
);

/** Register (or override) a sandbox provider — the seam for wiring a real cloud SDK. */
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
