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
