/**
 * Tier D / Phase 3 (Plan 3) — PURE execution-workspace policy resolver (ported from Paperclip's
 * execution-workspace-policy). DB-free, deterministic, unit-testable: it decides the effective
 * workspace strategy for a run, detects unrunnable combos, and resolves which environment a run uses.
 * The service layer feeds it project/issue settings and acts on the result; this file holds no state.
 */

export const WORKSPACE_STRATEGIES = [
  "project_primary", // clone/pull the project repo into the run's primary working dir
  "git_worktree", // a git worktree off a base ref (needs a project or a bound reusable workspace)
  "adapter_managed", // the runtime adapter manages its own workspace (metadata-only for us)
  "cloud_sandbox", // clone inside a provisioned sandbox (our default for a sandbox environment)
] as const;
export type WorkspaceStrategyType = (typeof WORKSPACE_STRATEGIES)[number];

export function isWorkspaceStrategy(v: unknown): v is WorkspaceStrategyType {
  return (WORKSPACE_STRATEGIES as readonly string[]).includes(v as string);
}

/**
 * Resolve the effective strategy: an issue/task pin wins over the project default, which wins over the
 * built-in default. A `sandbox` execution driver forces `cloud_sandbox` (the workspace lives inside the
 * ephemeral box, not on a host filesystem) unless a pin explicitly overrides it.
 */
export function resolveEffectiveWorkspaceStrategyType(input: {
  driver?: string | null; // environment driver (sandbox forces cloud_sandbox)
  projectDefaultStrategy?: string | null;
  issuePinnedStrategy?: string | null;
}): WorkspaceStrategyType {
  if (isWorkspaceStrategy(input.issuePinnedStrategy)) return input.issuePinnedStrategy;
  if (input.driver === "sandbox") return "cloud_sandbox";
  if (isWorkspaceStrategy(input.projectDefaultStrategy)) return input.projectDefaultStrategy;
  return "project_primary";
}

/**
 * A `git_worktree` strategy is unrunnable unless there is a project to derive the worktree from OR a
 * bound reusable workspace to attach to. (Mirrors Paperclip's load-bearing worktree-without-project
 * guard that the recent git-worktree heartbeat fix depends on.)
 */
export function isUnrunnableWorktreeCombo(input: {
  strategy: WorkspaceStrategyType;
  hasProject: boolean;
  hasReusableWorkspace: boolean;
}): boolean {
  return (
    input.strategy === "git_worktree" && !input.hasProject && !input.hasReusableWorkspace
  );
}

/**
 * Environment-id precedence for a run: the agent's bound environment wins, then an instance-scoped
 * pin, then the workspace default. Returns null when none is set (→ ad-hoc provider).
 */
export function resolveExecutionWorkspaceEnvironmentId(input: {
  agentEnvironmentId?: string | null;
  instanceEnvironmentId?: string | null;
  defaultEnvironmentId?: string | null;
}): string | null {
  return (
    input.agentEnvironmentId ?? input.instanceEnvironmentId ?? input.defaultEnvironmentId ?? null
  );
}

/**
 * The concrete runtime placement a run realizes into: the working directory, whether the source must
 * be cloned there, and (for worktree/branch strategies) the git branch to isolate the run on. Recorded
 * on the ExecutionWorkspace and consumed by the runtime to know WHERE to run — the deterministic half
 * of workspace realization (#133/#149/#175). Actually creating the directory/worktree on a host is the
 * infra-blocked half and lives in the runtime, not here.
 */
export interface WorkspaceRuntimeConfig {
  strategy: WorkspaceStrategyType;
  cwd: string | null; // null → the adapter owns its own working dir (adapter_managed)
  needsClone: boolean; // does the runtime need to place source at cwd before running?
  branchName: string | null; // isolation branch (worktree / sandbox); null → run on the base ref
  isEphemeral: boolean; // is this placement torn down at run end?
}

/** Sanitize an id into a git-ref-safe slug (no spaces, no `/`, no `..`, bounded length). */
function branchSlug(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  return slug || "run";
}

/**
 * Resolve the concrete placement for a run from its resolved strategy and the project-workspace
 * template. Pure and deterministic: same inputs → same cwd/branch, so a retry lands in the same place.
 * `basePath` is the host/sandbox root the run is anchored under (portable, forward-slash form).
 */
export function resolveWorkspaceRuntimeConfig(input: {
  strategy: WorkspaceStrategyType;
  runId: string;
  taskId?: string | null;
  basePath?: string | null; // project workspace cwd / host root
  branchPrefix?: string | null; // e.g. "agent/"; defaults to "agent/"
  sandboxWorkdir?: string | null; // sandbox default working dir; defaults to "/workspace"
}): WorkspaceRuntimeConfig {
  const base = (input.basePath ?? "").replace(/\\/g, "/").replace(/\/+$/g, "");
  const prefix = (input.branchPrefix ?? "agent/").replace(/\/+$/g, "");
  // Prefer the task id for branch identity (stable across a task's runs); fall back to the run id.
  const branchId = branchSlug(input.taskId ?? input.runId);
  const branchName = `${prefix}/${branchId}`.replace(/\/{2,}/g, "/");

  switch (input.strategy) {
    case "project_primary":
      // Clone/pull the project into the run's primary dir; run on the base ref, no isolation branch.
      return {
        strategy: input.strategy,
        cwd: base || null,
        needsClone: true,
        branchName: null,
        isEphemeral: false,
      };
    case "git_worktree":
      // A worktree off the base ref, isolated on its own branch, torn down at run end.
      return {
        strategy: input.strategy,
        cwd: base ? `${base}/.worktrees/${branchId}` : `.worktrees/${branchId}`,
        needsClone: false,
        branchName,
        isEphemeral: true,
      };
    case "cloud_sandbox":
      // The workspace lives inside the ephemeral box; clone into the sandbox workdir on its own branch.
      return {
        strategy: input.strategy,
        cwd: input.sandboxWorkdir ?? "/workspace",
        needsClone: true,
        branchName,
        isEphemeral: true,
      };
    case "adapter_managed":
    default:
      // The adapter provisions and owns its working dir; we record no cwd.
      return {
        strategy: input.strategy,
        cwd: null,
        needsClone: false,
        branchName: null,
        isEphemeral: true,
      };
  }
}
