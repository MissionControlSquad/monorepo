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
function runChild(
  file: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number },
): Promise<ExecResult> {
  return new Promise<ExecResult>((resolve) => {
    const child = spawn(file, args, { cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : undefined;

    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr: stderr + String(err), timedOut });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, timedOut });
    });
  });
}

/** Execute a command through the platform shell (used for raw RunnerCommands). */
export const execShell: ExecFn = (command, opts = {}) =>
  isWin ? runChild("cmd", ["/c", command], opts) : runChild("sh", ["-c", command], opts);

/**
 * Execute a rendered runtime plan. `shell` plans run through the platform shell; every other runtime
 * is spawned directly (argv[0] + args) with no shell, so arguments can't be re-interpreted.
 */
export const execPlan: ExecPlanFn = (plan, opts = {}) => {
  const runOpts = { cwd: plan.cwd, timeoutMs: opts.timeoutMs };
  if (plan.useShell) {
    return isWin
      ? runChild("cmd", ["/c", plan.argv[0]], runOpts)
      : runChild("sh", ["-c", plan.argv[0]], runOpts);
  }
  return runChild(plan.argv[0], plan.argv.slice(1), runOpts);
};
