// Execution-workspace realization (parity #175) for the runner — the host that actually has a
// filesystem. The control plane RECORDS workspace intent (ExecutionWorkspace: strategy/repoUrl/
// baseRef/branchName/cwd); this materializes it on disk and tears it down afterward.
//
// Two strategies:
//   - project_primary: shallow-clone the repo into the run dir (the common case; branch = baseRef).
//   - git_worktree:    keep a bare primary clone in a cache dir and `git worktree add` an isolated
//                      per-run branch — cheap, isolated, and cleanly removable.
// Cleanup runs an optional cleanupCommand in the workspace, then removes the worktree (worktree
// strategy). Pure command-builders are exported so the exact git invocations are unit-tested.

export type WorkspaceStrategy = "project_primary" | "git_worktree";

export interface WorkspaceSpec {
  strategy?: WorkspaceStrategy;
  repoUrl?: string | null;
  /** Branch/tag/commit the workspace is based on. */
  baseRef?: string | null;
  /** Worktree branch to create/checkout (git_worktree only). */
  branchName?: string | null;
  /** Target working directory. */
  dir: string;
  /** Bare primary-clone location for the worktree strategy. */
  cacheDir?: string | null;
  /** Optional teardown command run in the workspace before removal. */
  cleanupCommand?: string | null;
}

export type ExecShell = (
  command: string,
  opts?: { timeoutMs?: number },
) => Promise<{ exitCode: number | null; stderr: string }>;

/** POSIX single-quote a value so it is safe to interpolate into a shell command. */
export function shq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * The shell commands that realize the workspace on disk. Pure — returns [] when there is no repo to
 * check out (nothing to realize). Ordered; run sequentially, stop on first failure.
 */
export function realizeCommands(spec: WorkspaceSpec): string[] {
  if (!spec.repoUrl) return [];
  const dir = shq(spec.dir);
  const repo = shq(spec.repoUrl);

  if (spec.strategy === "git_worktree" && spec.cacheDir && spec.branchName) {
    const cache = shq(spec.cacheDir);
    const base = shq(spec.baseRef && spec.baseRef.trim() ? spec.baseRef : "HEAD");
    const branch = shq(spec.branchName);
    return [
      // Ensure a bare primary clone exists, then refresh it.
      `[ -d ${cache} ] || git clone --bare ${repo} ${cache}`,
      `git --git-dir=${cache} fetch --all --prune`,
      // Isolated per-run worktree on its own branch, based on baseRef.
      `git --git-dir=${cache} worktree add -B ${branch} ${dir} ${base}`,
    ];
  }

  // project_primary: shallow clone (a specific ref when given), or pull if the dir already exists.
  const branchFlag = spec.baseRef && spec.baseRef.trim() ? `--branch ${shq(spec.baseRef)} ` : "";
  return [
    `git clone --depth 1 ${branchFlag}${repo} ${dir} 2>/dev/null || (cd ${dir} && git pull --ff-only)`,
  ];
}

/**
 * The shell commands that tear the workspace down: the optional cleanupCommand, then removal of the
 * worktree (worktree strategy). project_primary dirs are left for reuse. Pure; best-effort at runtime.
 */
export function cleanupCommands(spec: WorkspaceSpec): string[] {
  const dir = shq(spec.dir);
  const cmds: string[] = [];
  if (spec.cleanupCommand && spec.cleanupCommand.trim()) {
    cmds.push(`cd ${dir} && ${spec.cleanupCommand}`);
  }
  if (spec.strategy === "git_worktree" && spec.cacheDir) {
    const cache = shq(spec.cacheDir);
    cmds.push(`git --git-dir=${cache} worktree remove --force ${dir} 2>/dev/null || rm -rf ${dir}`);
  }
  return cmds;
}

/** Realize the workspace on disk. Throws on the first failing command. */
export async function realizeWorkspace(spec: WorkspaceSpec, exec: ExecShell): Promise<void> {
  for (const command of realizeCommands(spec)) {
    const res = await exec(command, { timeoutMs: 180_000 });
    if (res.exitCode !== 0) {
      throw new Error(`workspace realize failed: ${command}\n${res.stderr.slice(0, 300)}`);
    }
  }
}

/** Tear the workspace down. Best-effort — never throws (teardown must not fail a completed run). */
export async function cleanupWorkspace(spec: WorkspaceSpec, exec: ExecShell): Promise<void> {
  for (const command of cleanupCommands(spec)) {
    await exec(command, { timeoutMs: 60_000 }).catch(() => {});
  }
}
