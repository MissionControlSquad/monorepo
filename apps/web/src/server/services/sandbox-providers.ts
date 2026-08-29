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
import { mkdtempSync, rmSync, existsSync } from "node:fs";
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

function runLocal(
  command: string,
  cwd: string,
  timeoutMs?: number,
  onLog?: (chunk: { stream: "stdout" | "stderr"; data: string }) => void,
  signal?: AbortSignal,
): Promise<SandboxExecResult> {
  return new Promise((resolve) => {
    // `detached` puts the command in its own process group so a timeout can kill the WHOLE tree
    // (the shell AND its children). Otherwise a grandchild (e.g. a spawned runtime) keeps the stdio
    // pipes open and `close` never fires — the timeout would hang and orphans would survive.
    const child = spawn("sh", ["-c", command], { cwd, detached: true });
    let stdout = "";
    let stderr = "";
    let outDropped = 0;
    let errDropped = 0;
    let timedOut = false;
    let aborted = false;
    const killTree = (sig: NodeJS.Signals) => {
      try {
        if (child.pid) process.kill(-child.pid, sig); // negative pid → the process group
      } catch {
        child.kill(sig); // group already gone / not a leader — fall back to the child
      }
    };
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          killTree("SIGKILL");
        }, timeoutMs)
      : undefined;
    // In-flight cancellation (§3 #2): abort SIGKILLs the whole process tree so a RUNNING run is
    // actually terminated. `aborted` is surfaced on the result so the run finalizer marks it canceled
    // (distinct from a timeout kill). If the signal already aborted, kill immediately.
    const onAbort = () => {
      aborted = true;
      killTree("SIGKILL");
    };
    if (signal) {
      if (signal.aborted) queueMicrotask(onAbort);
      else signal.addEventListener("abort", onAbort, { once: true });
    }
    child.stdout?.on("data", (d: Buffer) => {
      const s = d.toString();
      if (stdout.length < MAX_CAPTURE_BYTES) stdout += s;
      else outDropped += d.length;
      onLog?.({ stream: "stdout", data: s });
    });
    child.stderr?.on("data", (d: Buffer) => {
      const s = d.toString();
      if (stderr.length < MAX_CAPTURE_BYTES) stderr += s;
      else errDropped += d.length;
      onLog?.({ stream: "stderr", data: s });
    });
    const cap = (s: string, dropped: number) =>
      dropped > 0 ? `${s}\n…[truncated ${dropped} bytes]` : s;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    };
    child.on("error", (err) => {
      cleanup();
      resolve({
        exitCode: null,
        stdout: cap(stdout, outDropped),
        stderr: cap(stderr, errDropped) + String(err),
        aborted,
      });
    });
    child.on("close", (code, procSignal) => {
      cleanup();
      resolve({
        exitCode: code,
        stdout: cap(stdout, outDropped),
        stderr:
          cap(stderr, errDropped) +
          (aborted ? "\n…[killed: run canceled]" : timedOut ? "\n…[killed: exceeded timeout]" : ""),
        timedOut,
        aborted,
        signal: procSignal ?? null,
      });
    });
  });
}

/** A local handle whose `id` IS its working dir — so a lease can resume/destroy it by that id. */
function localHandle(dir: string): SandboxHandle {
  return {
    id: dir,
    providerKey: "local",
    exec: (command, opts) =>
      runLocal(command, opts?.cwd ?? dir, opts?.timeoutMs, opts?.onLog, opts?.signal),
    destroy: async () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const localProvider: SandboxProvider = {
  key: "local",
  displayName: "Local (this host)",
  requiresApiKey: false,
  credentialKeys: [],
  isolating: false, // runs on the control-plane host — NOT for untrusted/low-trust agents

  provision: async () => localHandle(mkdtempSync(join(tmpdir(), "agentcenter-sbx-"))),

  // Lease reuse: the provider lease id is the dir. Re-attach if it still exists (else the lease is stale).
  resume: async (providerLeaseId) => {
    if (!existsSync(providerLeaseId)) {
      throw new Error(`Local sandbox ${providerLeaseId} no longer exists (cannot resume).`);
    }
    return localHandle(providerLeaseId);
  },

  destroyById: async (providerLeaseId) => {
    rmSync(providerLeaseId, { recursive: true, force: true });
  },

  // The local provider has no real image registry — this is a STUB so the custom-image lifecycle is
  // exercisable end-to-end (the ref is a deterministic pointer at the captured dir, not a portable
  // image). Real capture is a cloud-provider capability (e2b/daytona/k8s snapshot).
  snapshot: async (handle) => ({
    templateRef: `local-image:${handle.id}`,
    templateKind: "snapshot",
  }),
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
