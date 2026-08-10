import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  frameJsonRpc,
  parseNdjson,
  pluginCrashPolicy,
  PLUGIN_SHUTDOWN_SEQUENCE,
  type CrashPolicyOptions,
  type CrashPolicyDecision,
  type JsonRpcMessage,
  type PluginWorkerManager,
} from "@agentcenter/utils";

// Out-of-process plugin worker manager (parity #129 — the fork-based implementation of the
// PluginWorkerManager seam). Each plugin runs in its own child_process.fork()ed worker with a MINIMAL env
// (the caller passes an env already built by buildMinimalWorkerEnv — no ambient secrets). Host↔worker
// traffic is NDJSON JSON-RPC over the child's stdin/stdout (frameJsonRpc/parseNdjson); stderr is a log
// side-channel. On a crash we apply pluginCrashPolicy (restart with backoff, or give up); shutdown
// follows PLUGIN_SHUTDOWN_SEQUENCE (drain → SIGTERM grace → SIGKILL).
//
// SECURITY HONESTY: fork() gives PROCESS + ENV isolation (a crash can't take down the host; secrets are
// stripped from the child env), NOT a security sandbox. A forked worker still shares the OS user, the
// filesystem, and the network. Running fully-untrusted third-party code safely (seccomp/container/VM)
// remains a documented seam — see plugin-worker-entry.mjs. What is REAL here is the fork+RPC round-trip,
// crash policy, and graceful shutdown, all of which the tests exercise.

/** Where the default worker entrypoint lives (a plain .mjs, no workspace deps — forkable by path). */
export function defaultWorkerEntry(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "plugin-worker-entry.mjs");
}

export type WorkerEventType = "start" | "crash" | "restart" | "giveup" | "stop";
export interface WorkerEvent {
  type: WorkerEventType;
  pluginId: string;
  decision?: CrashPolicyDecision;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface WorkerState {
  pluginId: string;
  entrypoint: string;
  /** The plugin MODULE the entry loads (passed to the worker via env), distinct from the entry itself. */
  modulePath: string;
  env: Record<string, string>;
  child: ChildProcess | null;
  buffer: string;
  pending: Map<number, Pending>;
  nextId: number;
  consecutiveCrashes: number;
  stopping: boolean;
  /** Set once giveup fires — the worker is disabled pending operator attention (no auto-restart). */
  disabled: boolean;
}

export interface WorkerManagerOptions {
  crashPolicy?: CrashPolicyOptions;
  /** Per-RPC response timeout. */
  invokeTimeoutMs?: number;
  /** The forkable entrypoint (defaults to plugin-worker-entry.mjs). Overridable for tests. */
  entrypoint?: string;
}

export class ForkPluginWorkerManager implements PluginWorkerManager {
  private readonly workers = new Map<string, WorkerState>();
  private messageHandlers: ((pluginId: string, msg: JsonRpcMessage) => void)[] = [];
  private eventHandlers: ((e: WorkerEvent) => void)[] = [];
  private readonly crashPolicy: CrashPolicyOptions;
  private readonly invokeTimeoutMs: number;
  private readonly entrypoint: string;

  constructor(opts: WorkerManagerOptions = {}) {
    this.crashPolicy = opts.crashPolicy ?? {};
    this.invokeTimeoutMs = opts.invokeTimeoutMs ?? 30_000;
    this.entrypoint = opts.entrypoint ?? defaultWorkerEntry();
  }

  onMessage(handler: (pluginId: string, msg: JsonRpcMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  onEvent(handler: (e: WorkerEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  private emit(e: WorkerEvent): void {
    for (const h of this.eventHandlers) h(e);
  }

  /**
   * Start a worker for a plugin. `entrypoint` here is the PLUGIN MODULE to load (the manifest's runtime
   * module); the fork always runs the fixed worker entry, which imports that module. `env` must already
   * be minimal (built via buildMinimalWorkerEnv) — this manager does not add ambient secrets.
   */
  async start(
    pluginId: string,
    entrypoint: string,
    env: Record<string, string>,
  ): Promise<{
    pluginId: string;
    send: (msg: JsonRpcMessage) => void;
    shutdown: () => Promise<void>;
  }> {
    if (this.workers.has(pluginId)) {
      const existing = this.workers.get(pluginId)!;
      if (existing.child && !existing.disabled) return this.handleFor(pluginId);
    }
    const state: WorkerState = {
      pluginId,
      entrypoint: this.entrypoint,
      modulePath: entrypoint,
      env,
      child: null,
      buffer: "",
      pending: new Map(),
      nextId: 1,
      consecutiveCrashes: 0,
      stopping: false,
      disabled: false,
    };
    this.workers.set(pluginId, state);
    this.spawn(state);
    return this.handleFor(pluginId);
  }

  private handleFor(pluginId: string) {
    return {
      pluginId,
      send: (msg: JsonRpcMessage) => this.rawSend(pluginId, msg),
      shutdown: () => this.stop(pluginId),
    };
  }

  private spawn(state: WorkerState): void {
    const child = fork(state.entrypoint, [], {
      // NDJSON JSON-RPC over stdin/stdout; stderr piped as a log side-channel. 'ipc' is required by
      // fork() but unused — the wire protocol is the stdio pipes, matching plugin-worker-protocol.ts.
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      // Minimal env ONLY. `PLUGIN_MODULE` tells the entry which module to load; `PLUGIN_ID` is for logs.
      env: {
        ...state.env,
        PLUGIN_MODULE: state.modulePath,
        PLUGIN_ID: state.pluginId,
      } as unknown as NodeJS.ProcessEnv,
    });
    state.child = child;
    state.buffer = "";

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => this.onStdout(state, chunk));
    child.on("exit", (code, signal) => this.onExit(state, code, signal));
    child.on("error", () => {
      /* surfaced via exit; nothing to do here beyond preventing an unhandled 'error' throw */
    });
    this.emit({ type: "start", pluginId: state.pluginId });
  }

  private onStdout(state: WorkerState, chunk: string): void {
    state.buffer += chunk;
    const { messages, rest } = parseNdjson(state.buffer);
    state.buffer = rest;
    for (const msg of messages) this.onMessage_(state, msg);
  }

  private onMessage_(state: WorkerState, msg: JsonRpcMessage): void {
    // A response to an in-flight invoke resolves its promise; anything else is a notification.
    if (msg.id !== undefined && typeof msg.id === "number" && state.pending.has(msg.id)) {
      const p = state.pending.get(msg.id)!;
      state.pending.delete(msg.id);
      clearTimeout(p.timer);
      // A healthy response resets the crash counter (a "healthy run").
      state.consecutiveCrashes = 0;
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
      return;
    }
    for (const h of this.messageHandlers) h(state.pluginId, msg);
  }

  private rawSend(pluginId: string, msg: JsonRpcMessage): void {
    const state = this.workers.get(pluginId);
    if (!state?.child?.stdin) throw new Error(`worker for '${pluginId}' is not running`);
    state.child.stdin.write(frameJsonRpc(msg));
  }

  /**
   * Invoke a method in the plugin worker and await its result over JSON-RPC. Used by the tool dispatcher
   * and job runner. Rejects on worker error, a JSON-RPC error response, or timeout.
   */
  invoke(pluginId: string, method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
    const state = this.workers.get(pluginId);
    if (!state || state.disabled || !state.child)
      return Promise.reject(new Error(`worker for '${pluginId}' is not available`));
    const id = state.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pending.delete(id);
        reject(new Error(`plugin '${pluginId}' invoke '${method}' timed out`));
      }, timeoutMs ?? this.invokeTimeoutMs);
      state.pending.set(id, { resolve, reject, timer });
      try {
        this.rawSend(pluginId, { jsonrpc: "2.0", id, method, params });
      } catch (err) {
        clearTimeout(timer);
        state.pending.delete(id);
        reject(err as Error);
      }
    });
  }

  private onExit(state: WorkerState, code: number | null, signal: NodeJS.Signals | null): void {
    state.child = null;
    // Fail every in-flight RPC so callers don't hang on a dead worker.
    for (const [, p] of state.pending) {
      clearTimeout(p.timer);
      p.reject(
        new Error(`plugin '${state.pluginId}' worker exited (code=${code} signal=${signal})`),
      );
    }
    state.pending.clear();

    if (state.stopping) {
      this.emit({ type: "stop", pluginId: state.pluginId, exitCode: code, signal });
      return;
    }

    // Unexpected exit = crash. Apply the pure crash policy.
    state.consecutiveCrashes += 1;
    const decision = pluginCrashPolicy(state.consecutiveCrashes, this.crashPolicy);
    this.emit({ type: "crash", pluginId: state.pluginId, exitCode: code, signal, decision });
    if (decision.action === "giveup") {
      state.disabled = true;
      this.emit({ type: "giveup", pluginId: state.pluginId, decision });
      return;
    }
    setTimeout(() => {
      if (state.stopping || state.disabled) return;
      this.emit({ type: "restart", pluginId: state.pluginId, decision });
      this.spawn(state);
    }, decision.backoffMs);
  }

  /** Graceful shutdown: send `shutdown` RPC, drain, then SIGTERM → SIGKILL escalation. */
  async stop(pluginId: string): Promise<void> {
    const state = this.workers.get(pluginId);
    if (!state) return;
    state.stopping = true;
    const child = state.child;
    if (!child) {
      this.workers.delete(pluginId);
      return;
    }
    // Ask the worker to shut down cleanly.
    try {
      this.rawSend(pluginId, { jsonrpc: "2.0", method: "shutdown" });
    } catch {
      /* stdin may already be gone */
    }
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    const raceTimeout = (ms: number) =>
      new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms));

    // 1) Drain: give in-flight work a bounded window to finish and the child to exit on its own.
    if (
      (await Promise.race([
        exited.then(() => "exited" as const),
        raceTimeout(PLUGIN_SHUTDOWN_SEQUENCE.sigtermGraceMs),
      ])) !== "exited"
    ) {
      // 2) SIGTERM + grace.
      child.kill("SIGTERM");
      if (
        (await Promise.race([
          exited.then(() => "exited" as const),
          raceTimeout(PLUGIN_SHUTDOWN_SEQUENCE.sigtermGraceMs),
        ])) !== "exited"
      ) {
        // 3) SIGKILL.
        child.kill("SIGKILL");
        await exited;
      }
    }
    this.workers.delete(pluginId);
  }

  /** Whether a worker is currently running (not disabled, has a live child). For status/tests. */
  isRunning(pluginId: string): boolean {
    const s = this.workers.get(pluginId);
    return !!s && !s.disabled && !!s.child;
  }

  isDisabled(pluginId: string): boolean {
    return this.workers.get(pluginId)?.disabled ?? false;
  }

  /** Stop every worker (host shutdown). */
  async stopAll(): Promise<void> {
    await Promise.all([...this.workers.keys()].map((id) => this.stop(id)));
  }
}

// Process-wide default manager. The runtime layer (plugin-runtime.ts) uses this; tests may construct
// their own with tighter crash-policy knobs.
let defaultManager: ForkPluginWorkerManager | null = null;
export function getPluginWorkerManager(): ForkPluginWorkerManager {
  if (!defaultManager) defaultManager = new ForkPluginWorkerManager();
  return defaultManager;
}
