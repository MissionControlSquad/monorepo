import { spawn } from "node:child_process";

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

/**
 * Execute a command through the platform shell, capturing stdout/stderr and enforcing a timeout.
 * Nothing leaves the machine except the result the daemon chooses to post back.
 */
export const execShell: ExecFn = (command, opts = {}) =>
  new Promise<ExecResult>((resolve) => {
    const isWin = process.platform === "win32";
    const child = isWin
      ? spawn("cmd", ["/c", command], { cwd: opts.cwd })
      : spawn("sh", ["-c", command], { cwd: opts.cwd });

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
