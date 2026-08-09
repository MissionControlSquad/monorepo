// Plugin worker host protocol (parity #123/#129/#106, pure halves + contracts). Paperclip isolates each
// plugin in a forked child over NDJSON JSON-RPC with a MINIMAL env (no process.env spread — a
// DATABASE_URL/secret leak into plugin code would be a real breach) and a crash-backoff policy. The
// fork/spawn itself is the infra seam; the security-critical env stripping, the wire codec, and the
// crash policy are pure and live here so they are testable in isolation. The host interfaces below are
// the contract a fork-based implementation satisfies.

// ── Minimal worker env (security core) ────────────────────────────────────────

// Keys whose VALUES are secrets and must never reach a plugin child, even if an allowlist names them.
const SECRET_KEY_PATTERN = /(SECRET|PASSWORD|TOKEN|PRIVATE|CREDENTIAL|DATABASE_URL|_KEY$|APIKEY|API_KEY)/i;

/**
 * Build the environment for a plugin child process. Starts EMPTY (never spreads the host env), copies
 * only explicitly allowlisted keys from `base`, and refuses any key matching a secret pattern — so a
 * misconfigured allowlist still can't leak DATABASE_URL or a provider key into plugin code. `extra`
 * values (plugin config, non-secret) are merged last but are also secret-filtered.
 */
export function buildMinimalWorkerEnv(
  base: Record<string, string | undefined>,
  allowKeys: readonly string[],
  extra: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of allowKeys) {
    if (SECRET_KEY_PATTERN.test(key)) continue; // never pass a secret-named key
    const value = base[key];
    if (value !== undefined) out[key] = value;
  }
  for (const [key, value] of Object.entries(extra)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    out[key] = value;
  }
  return out;
}

/** True if a value would leak a host secret into a worker env (for asserting in tests/guards). */
export function isSecretEnvKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

// ── NDJSON JSON-RPC codec (host ↔ worker wire) ────────────────────────────────

export interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** Frame a JSON-RPC message as a single NDJSON line (newline-terminated). */
export function frameJsonRpc(msg: JsonRpcMessage): string {
  return JSON.stringify(msg) + "\n";
}

/**
 * Incrementally parse an NDJSON buffer into complete JSON-RPC messages. Returns the parsed messages and
 * the trailing partial line (`rest`) to prepend to the next chunk. Malformed lines are skipped (a
 * corrupt frame must not desync the stream) and surfaced in `errors`.
 */
export function parseNdjson(buffer: string): {
  messages: JsonRpcMessage[];
  rest: string;
  errors: string[];
} {
  const messages: JsonRpcMessage[] = [];
  const errors: string[] = [];
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? ""; // last element is the incomplete tail (or "" if buffer ended in \n)
  for (const line of lines) {
    if (line.trim() === "") continue;
    try {
      messages.push(JSON.parse(line) as JsonRpcMessage);
    } catch {
      errors.push(line.slice(0, 200));
    }
  }
  return { messages, rest, errors };
}

// ── Crash-backoff policy ──────────────────────────────────────────────────────

export interface CrashPolicyOptions {
  maxConsecutiveCrashes?: number; // give up after this many crashes with no healthy run between
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface CrashPolicyDecision {
  action: "restart" | "giveup";
  backoffMs: number;
  reason: string;
}

/**
 * Decide what to do after a plugin worker crash given how many times it has crashed CONSECUTIVELY (a
 * healthy run resets the count to 0). Backoff grows exponentially with the crash count; after
 * `maxConsecutiveCrashes` the worker is given up (disabled pending operator attention). Mirrors
 * Paperclip's MAX_CONSECUTIVE_CRASHES=10.
 */
export function pluginCrashPolicy(
  consecutiveCrashes: number,
  opts: CrashPolicyOptions = {},
): CrashPolicyDecision {
  const max = opts.maxConsecutiveCrashes ?? 10;
  const base = opts.baseBackoffMs ?? 1000;
  const cap = opts.maxBackoffMs ?? 60_000;
  if (consecutiveCrashes >= max)
    return { action: "giveup", backoffMs: 0, reason: `${consecutiveCrashes} consecutive crashes` };
  const backoffMs = Math.min(cap, base * 2 ** Math.max(0, consecutiveCrashes - 1));
  return { action: "restart", backoffMs, reason: `restart after ${backoffMs}ms backoff` };
}

/** The graceful-shutdown escalation a worker host follows (SIGTERM grace → SIGKILL). Pure config. */
export const PLUGIN_SHUTDOWN_SEQUENCE = {
  drainMs: 10_000, // wait for in-flight RPCs to finish
  sigtermGraceMs: 5_000, // after SIGTERM, wait before SIGKILL
} as const;

// ── Host contracts (interfaces the fork-based infra impl satisfies) ────────────

export interface PluginWorkerHandle {
  pluginId: string;
  send(msg: JsonRpcMessage): void;
  /** Terminate following PLUGIN_SHUTDOWN_SEQUENCE. */
  shutdown(): Promise<void>;
}

/**
 * The out-of-process worker manager (#129). An implementation forks a child per plugin with
 * buildMinimalWorkerEnv, speaks NDJSON JSON-RPC (frameJsonRpc/parseNdjson), and applies pluginCrashPolicy
 * on exit. Left unimplemented here — this is the seam.
 */
export interface PluginWorkerManager {
  start(pluginId: string, entrypoint: string, env: Record<string, string>): Promise<PluginWorkerHandle>;
  stop(pluginId: string): Promise<void>;
  onMessage(handler: (pluginId: string, msg: JsonRpcMessage) => void): void;
}

/** The secondary in-process vm sandbox (#123) — evaluates untrusted plugin code with a frozen global. */
export interface PluginRuntimeSandbox {
  run<T>(code: string, context: Record<string, unknown>): Promise<T>;
}

/** The dev hot-reload watcher (#106) — watches local folders and re-emits load events. */
export interface PluginDevWatcher {
  watch(paths: string[], onChange: (path: string) => void): () => void;
}
