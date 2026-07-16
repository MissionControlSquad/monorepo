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
  /** true → provision() needs a configured credential (not runnable without it). */
  requiresApiKey: boolean;
  /** Per-DEPLOYMENT env keys this provider reads (the operator owns these, like HETZNER_API_TOKEN). */
  credentialEnvKeys: string[];
  provision(spec?: SandboxSpec): Promise<SandboxHandle>;
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
 * Build a cloud SandboxProvider that first verifies its per-deployment credentials are present, then
 * delegates to the real provisioning logic. The "not configured" error names the missing env keys so
 * an operator knows exactly what to set — and it is thrown BEFORE any SDK load, so an unconfigured
 * provider never pretends to work.
 */
export function defineCloudProvider(opts: {
  key: string;
  displayName: string;
  credentialEnvKeys: string[];
  provision: (spec: SandboxSpec | undefined, env: NodeJS.ProcessEnv) => Promise<SandboxHandle>;
}): SandboxProvider {
  return {
    key: opts.key,
    displayName: opts.displayName,
    requiresApiKey: true,
    credentialEnvKeys: opts.credentialEnvKeys,
    provision: async (spec) => {
      const missing = opts.credentialEnvKeys.filter((k) => !process.env[k]?.trim());
      if (missing.length > 0) {
        throw new Error(
          `${opts.displayName} is not configured on this deployment — set ${missing.join(", ")}.`,
        );
      }
      return opts.provision(spec, process.env);
    },
  };
}
