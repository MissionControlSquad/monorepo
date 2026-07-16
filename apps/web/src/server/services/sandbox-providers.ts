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
  /** Per-DEPLOYMENT env keys this provider reads (the operator owns these, like HETZNER_API_TOKEN). */
  credentialEnvKeys: string[];
  provision(spec?: SandboxSpec): Promise<SandboxHandle>;
}

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

// ─── cloud providers (registered; require API key + SDK to provision) ────────

/**
 * A cloud provider whose credentials are per-DEPLOYMENT (env keys the operator sets — we own them
 * and bill users for usage). provision() distinguishes "not configured on this deployment" from
 * "configured, but its SDK integration is pending" — neither is faked as a working sandbox.
 */
function cloudProvider(
  key: string,
  displayName: string,
  credentialEnvKeys: string[],
): SandboxProvider {
  return {
    key,
    displayName,
    requiresApiKey: true,
    credentialEnvKeys,
    provision: async () => {
      if (
        !isSandboxProviderConfigured({
          key,
          displayName,
          requiresApiKey: true,
          credentialEnvKeys,
          provision: null as never,
        })
      )
        throw new Error(
          `${displayName} is not configured on this deployment — set ${credentialEnvKeys.join(", ")}.`,
        );
      // Credentials are present; the concrete SDK provisioning is wired per-provider (one by one).
      throw new Error(
        `${displayName} credentials are configured, but its provisioning SDK is not yet wired.`,
      );
    },
  };
}

const CLOUD_PROVIDERS: SandboxProvider[] = [
  cloudProvider("e2b", "E2B", ["E2B_API_KEY"]),
  cloudProvider("daytona", "Daytona", ["DAYTONA_API_KEY"]),
  cloudProvider("modal", "Modal", ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"]),
  cloudProvider("novita", "Novita", ["NOVITA_API_KEY"]),
  cloudProvider("cloudflare", "Cloudflare", ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]),
  cloudProvider("kubernetes", "Kubernetes", ["KUBECONFIG"]),
  cloudProvider("exe-dev", "exe.dev", ["EXE_DEV_API_KEY"]),
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
