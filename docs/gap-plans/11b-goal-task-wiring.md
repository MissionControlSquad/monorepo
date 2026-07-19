# Epic #11b — Goals → Task wiring

**Completes** Epic #11 deferral **D2** ("we do NOT rewire the Task path in v1"). The pure fallback
resolvers were ported + tested in #11 and later centralized in `@agentcenter/utils`
(`resolveIssueGoalId`); this slice wires them into the task path.

## What it does
- **Schema:** `Task.goalId` + `Project.goalId` (the project's *default* goal), both FK→`Goal`
  (`onDelete: SetNull`) + Goal back-relations. Migration `add_task_goal`.
- **Resolution:** `resolveTaskGoalId({ projectId, goalId, fallbackWorkspaceId })` (goals service) uses
  the shared `resolveIssueGoalId` with precedence **explicit goal → project default goal → workspace
  default company goal** (`resolveDefaultGoal`). Workspace derives from the project when present, else
  the caller's tenancy. Returns null (no auto-assign) when `GOALS` is off — non-breaking.
- **Wiring:** `createTask` auto-resolves + stores `goalId`. `Task.goalId` + `Project.defaultGoalId`
  exposed on GraphQL; a `setProjectDefaultGoal(projectId, goalId?)` mutation (member, GOALS-gated,
  workspace-validated) sets/clears a project's default goal.

## Guardrails
- **DO NOT** auto-assign when GOALS is disabled (kill-switch, tested).
- **DO NOT** allow a cross-workspace project default goal (validated).
- Non-breaking: existing task creation is unchanged when there are no goals.

## Tests
Integration: create inherits workspace-default company goal · project default beats workspace default ·
explicit `goalId` beats both · null when no goals · GOALS-off skips auto-assign · `setProjectDefaultGoal`
set/clear + cross-workspace goal rejected. (The pure resolver precedence is already unit-tested in
`@agentcenter/utils`.)

## Deferred
`resolveNextIssueGoalId` (re-resolution on a task's project change during update) — the resolver is
shared + tested; wiring it into `updateTask` is a follow-up.
