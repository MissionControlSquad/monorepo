/**
 * Tier D — shared contracts + helpers for cloud sandbox providers.
 *
 * Our sandbox interface is deliberately narrower than Paperclip's: a provider `provision()`s an
 * ephemeral machine, exposes one `exec(command)` that captures stdout/stderr/exit, and `destroy()`s
 * it. We intentionally DO NOT port Paperclip's lease-reuse / pause / named-session / provenance /
 * tenant-RBAC machinery — those belong to its long-lived-lease model, not our provision→exec→destroy
 * contract. The concrete provider files below port the *core* SDK/REST calls faithfully from the
 * Paperclip plugins (same method names, same argument shapes).
 *
 * HONEST BOUNDARY: the vendor SDKs (e2b, @daytonaio/sdk, modal, novita-sandbox, @kubernetes/client-node)
 * are heavy + optional, so each provider loads its module via a runtime `import(<name>)` and is typed
 * against a locally-declared minimal interface (ported from the real SDK surface). This means:
 *   • typecheck passes without installing any of them,
 *   • a provider only needs its SDK present on deployments that actually enable it,
 *   • an un-installed SDK or a missing credential fails with a clear, actionable error — never faked.
 *
 * CREDENTIALS ARE BYO (bring-your-own): every cloud provider reads its API keys from the caller's
 * WORKSPACE secrets vault (resolved by name), NOT from deployment env vars. The customer stores their
 * own e2b/daytona/… key in their workspace; usage bills to THEIR provider account; we only orchestrate.
 * This is the pure bring-your-own-infra model — there is no operator-owned credential tier.
 */

export interface SandboxSpec {
  /** Image / template / snapshot ref (provider-specific meaning; see each provider). */
  image?: string;
  /** Region hint (only a few providers honor it). */
  region?: string;
}

export interface SandboxExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** True when the command was killed because it exceeded its timeout budget. */
  timedOut?: boolean;
  /** The signal that terminated the process, if any (e.g. "SIGKILL"). */
  signal?: string | null;
}

/** A chunk of live output as a sandbox command runs (for streaming to the run's live status). */
export interface SandboxLogChunk {
  stream: "stdout" | "stderr";
  data: string;
}

export interface SandboxExecOpts {
  cwd?: string;
  timeoutMs?: number;
  /** Called with each output chunk as it arrives — enables mid-run streaming (Plan 6). */
  onLog?: (chunk: SandboxLogChunk) => void;
}

export interface SandboxHandle {
  id: string;
  providerKey: string;
  exec(command: string, opts?: SandboxExecOpts): Promise<SandboxExecResult>;
  destroy(): Promise<void>;
}

/** Resolve a per-workspace vault secret by name (BYO credentials). Returns null/undefined if absent. */
export type SandboxSecretResolver = (name: string) => Promise<string | null | undefined>;

/** Context handed to provision(): the caller's workspace + a resolver over its secrets vault. */
export interface SandboxProvisionContext {
  workspaceId: string;
  resolveSecret: SandboxSecretResolver;
}

export interface SandboxProvider {
  key: string;
  displayName: string;
  /** true → provision() needs a configured credential (not runnable without it). */
  requiresApiKey: boolean;
  /** Vault secret NAMES the WORKSPACE must provide (BYO). Empty for `local`. */
  credentialKeys: string[];
  /**
   * true = runs untrusted code in an ISOLATED ephemeral box (the customer's own account); false =
   * runs on the control-plane host (`local`). Low-trust/untrusted agents may only use isolating
   * providers (fail-closed admission).
   */
  isolating: boolean;
  provision(ctx: SandboxProvisionContext, spec?: SandboxSpec): Promise<SandboxHandle>;
  /**
   * Reconstruct a live handle for an ALREADY-provisioned sandbox by its provider lease id — the basis
   * for lease REUSE (a `reuse_*` policy keeps the machine and re-attaches on the next run). Optional:
   * a provider without it does not support reuse (the lease layer falls back to ephemeral).
   */
  resume?(providerLeaseId: string, ctx: SandboxProvisionContext): Promise<SandboxHandle>;
  /**
   * Destroy a sandbox by its provider lease id when we hold no live handle (the reaper / manual
   * destroy path). Optional — a provider without it can only be torn down via handle.destroy().
   */
  destroyById?(providerLeaseId: string, ctx: SandboxProvisionContext): Promise<void>;
  /**
   * Capture a live sandbox as a reusable image/snapshot (Plan 5 custom images). Returns a provider
   * ref future provisions can boot from (via SandboxSpec.image). Optional — a provider without it does
   * not support capture (the custom-image layer reports "capture unsupported").
   */
  snapshot?(
    handle: SandboxHandle,
    ctx: SandboxProvisionContext,
  ): Promise<{ templateRef: string; templateKind: string }>;
}

/** Default absolute sandbox lifetime (ms) — matches Paperclip's e2b/modal default. */
export const DEFAULT_SANDBOX_LIFETIME_MS = 3_600_000;

/** POSIX single-quote a string for safe interpolation into a shell command. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Prefix a `cd <cwd> &&` when a working directory is requested. */
export function withCwd(command: string, cwd?: string): string {
  return cwd ? `cd ${shellQuote(cwd)} && ${command}` : command;
}

/**
 * Wrap a command so it runs in a login shell (sources /etc/profile, ~/.profile, nvm, …) with the
 * requested cwd applied. Providers that take an argv array use this via `["sh", "-lc", <script>]`;
 * providers that take a command string can pass the string straight to their `commands.run`.
 */
export function loginShellCommand(command: string, cwd?: string): string {
  return withCwd(command, cwd);
}

/**
 * Runtime-load an optional vendor SDK by name. Uses a *variable* import specifier so TypeScript does
 * not require the module at compile time (typecheck stays green without the dep installed) and the
 * bundler leaves it as a runtime resolution. Throws a clear, install-actionable error if absent.
 */
export async function loadOptionalModule<T>(moduleName: string, providerName: string): Promise<T> {
  try {
    const mod = (await import(/* @vite-ignore */ moduleName)) as unknown;
    return mod as T;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${providerName} sandbox provider requires the "${moduleName}" package to be installed on ` +
        `this deployment (run: npm i ${moduleName}). Load error: ${detail}`,
    );
  }
}

/**
 * Build a cloud SandboxProvider that first resolves its BYO credentials from the caller's WORKSPACE
 * vault, then delegates to the real provisioning logic. The "not configured" error names the missing
 * secret names so the customer knows exactly what to add — and it is thrown BEFORE any SDK load, so an
 * unconfigured provider never pretends to work. The inner provision receives the resolved required
 * `creds` plus the full `ctx` (to look up OPTIONAL settings, e.g. a region/image, from the vault too).
 */
export function defineCloudProvider(opts: {
  key: string;
  displayName: string;
  credentialKeys: string[];
  provision: (
    creds: Record<string, string>,
    ctx: SandboxProvisionContext,
    spec: SandboxSpec | undefined,
  ) => Promise<SandboxHandle>;
}): SandboxProvider {
  return {
    key: opts.key,
    displayName: opts.displayName,
    requiresApiKey: true,
    credentialKeys: opts.credentialKeys,
    isolating: true, // ephemeral box on the customer's own account — contains untrusted code
    provision: async (ctx, spec) => {
      const creds: Record<string, string> = {};
      const missing: string[] = [];
      for (const name of opts.credentialKeys) {
        const value = (await ctx.resolveSecret(name))?.trim();
        if (value) creds[name] = value;
        else missing.push(name);
      }
      if (missing.length > 0) {
        throw new Error(
          `${opts.displayName} is not configured for this workspace — add ${missing.join(", ")} to the workspace secrets vault.`,
        );
      }
      return opts.provision(creds, ctx, spec);
    },
  };
}
