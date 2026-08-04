/**
 * Goals — shared vocabulary + pure issue→goal fallback resolvers (Epic #11). Import from
 * @agentcenter/utils; do NOT duplicate these as string literals. Precedence: explicit goal → project's
 * goal → workspace default.
 */

/** Goal hierarchy levels + statuses — single source of truth (mirrors the GoalLevel/GoalStatus enums). */
export const GOAL_LEVEL = { COMPANY: "company", TEAM: "team", AGENT: "agent", TASK: "task" } as const;
export const GOAL_LEVELS = Object.values(GOAL_LEVEL);
export type GoalLevel = (typeof GOAL_LEVELS)[number];

export const GOAL_STATUS = {
  PLANNED: "planned",
  ACTIVE: "active",
  COMPLETED: "completed",
  ARCHIVED: "archived",
} as const;
export const GOAL_STATUSES = Object.values(GOAL_STATUS);
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export function isGoalLevel(v: string): v is GoalLevel {
  return (GOAL_LEVELS as readonly string[]).includes(v);
}
export function isGoalStatus(v: string): v is GoalStatus {
  return (GOAL_STATUSES as readonly string[]).includes(v);
}

type MaybeId = string | null | undefined;

export function resolveIssueGoalId(input: {
  projectId: MaybeId;
  goalId: MaybeId;
  projectGoalId?: MaybeId;
  defaultGoalId: MaybeId;
}): string | null {
  if (input.goalId) return input.goalId;
  if (input.projectId) return input.projectGoalId ?? null;
  return input.defaultGoalId ?? null;
}

export function resolveNextIssueGoalId(input: {
  currentProjectId: MaybeId;
  currentGoalId: MaybeId;
  currentProjectGoalId?: MaybeId;
  projectId?: MaybeId;
  goalId?: MaybeId;
  projectGoalId?: MaybeId;
  defaultGoalId: MaybeId;
}): string | null {
  const projectId = input.projectId !== undefined ? input.projectId : input.currentProjectId;
  const projectGoalId =
    input.projectGoalId !== undefined
      ? input.projectGoalId
      : projectId
        ? input.currentProjectGoalId
        : null;

  const resolveFallbackGoalId = (targetProjectId: MaybeId, targetProjectGoalId: MaybeId) => {
    if (targetProjectId) return targetProjectGoalId ?? null;
    return input.defaultGoalId ?? null;
  };

  if (input.goalId !== undefined) {
    return input.goalId ?? resolveFallbackGoalId(projectId, projectGoalId);
  }

  const currentFallbackGoalId = resolveFallbackGoalId(
    input.currentProjectId,
    input.currentProjectGoalId,
  );
  const nextFallbackGoalId = resolveFallbackGoalId(projectId, projectGoalId);

  if (!input.currentGoalId) {
    return nextFallbackGoalId;
  }

  if (input.currentGoalId === currentFallbackGoalId) {
    return nextFallbackGoalId;
  }

  return input.currentGoalId;
}
