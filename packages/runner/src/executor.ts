import { spawn } from "node:child_process";
import type { AdapterInvocation } from "@agentcenter/utils";

export interface ExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface ExecOptions {
  cwd?: string;
  timeoutMs?: number;
}

/** Run a shell command locally. Injected into the poll loop so tests can substitute a fake. */
export type ExecFn = (command: string, opts?: ExecOptions) => Promise<ExecResult>;

/** Run a rendered runtime plan (argv). Injected into the task cycle so tests can substitute a fake. */
export type ExecPlanFn = (
  plan: AdapterInvocation,
  opts?: { timeoutMs?: number },
) => Promise<ExecResult>;

const isWin = process.platform === "win32";

/** Core spawn+capture. Enforces a timeout; nothing leaves the machine except the returned result. */
// Bound in-memory capture so a runaway command (e.g. `yes`) can't OOM the daemon. The control plane
// caps stored output further (64 KB); this is the memory-safety bound at the source.
const MAX_CAPTURE_BYTES = 1_000_000;

function runChild(
  file: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number },
): Promise<ExecResult> {
  return new Promise<ExecResult>((resolve) => {
    const child = spawn(file, args, { cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    let outDropped = 0;
    let errDropped = 0;
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : undefined;

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
        timedOut,
      });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ exitCode: code, stdout: cap(stdout, outDropped), stderr: cap(stderr, errDropped), timedOut });
    });
  });
}

/** Execute a command through the platform shell (used for raw RunnerCommands). */
export const execShell: ExecFn = (command, opts = {}) =>
  isWin ? runChild("cmd", ["/c", command], opts) : runChild("sh", ["-c", command], opts);

/** Fire an HTTP invocation (webhook adapter). 2xx → success; anything else → failure. */
async function execHttp(
  plan: Extract<AdapterInvocation, { mode: "http" }>,
  opts: { timeoutMs?: number },
): Promise<ExecResult> {
  const controller = new AbortController();
  const timer = opts.timeoutMs ? setTimeout(() => controller.abort(), opts.timeoutMs) : undefined;
  try {
    const res = await fetch(plan.url, {
      method: plan.method,
      headers: plan.headers,
      body: plan.body,
      signal: controller.signal,
    });
    const text = await res.text();
    return {
      exitCode: res.ok ? 0 : 1,
      stdout: text,
      stderr: res.ok ? "" : `HTTP ${res.status} ${res.statusText}`,
      timedOut: false,
    };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return { exitCode: null, stdout: "", stderr: String(err), timedOut };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Execute a rendered runtime plan. `http` plans fire a webhook; `shell` plans run through the
 * platform shell; every other runtime is spawned directly (argv[0] + args) with no shell.
 */
export const execPlan: ExecPlanFn = (plan, opts = {}) => {
  if (plan.mode === "http") return execHttp(plan, opts);
  const runOpts = { cwd: plan.cwd, timeoutMs: opts.timeoutMs };
  if (plan.useShell) {
    return isWin
      ? runChild("cmd", ["/c", plan.argv[0]], runOpts)
      : runChild("sh", ["-c", plan.argv[0]], runOpts);
  }
  return runChild(plan.argv[0], plan.argv.slice(1), runOpts);
};
