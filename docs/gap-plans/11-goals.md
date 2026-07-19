# Epic #11 — Goals / OKRs

**Phase:** 6 (Polish) · **Gap:** 🟡 Medium (new entity + hierarchy) · **Dependencies:** #1 (buildbase
tenancy), `Agent` (owner FK).

Ports Paperclip's company **goals**: a hierarchical goal tree (company → team → task levels), each
goal optionally owned by an agent, with a "default company goal" resolution used as the fallback goal
for issues/tasks. Grounded in Paperclip `services/goals.ts` (`goalService`, `getDefaultCompanyGoal`),
`routes/goals.ts` (CRUD + activity), and `services/issue-goal-fallback.ts` (`resolveIssueGoalId`,
`resolveNextIssueGoalId`).

## 0. Decisions / deviations
- **D1** — `companyId` → `workspaceId String` (Epic #1, D5; no FK).
- **D2 (scope)** — v1 is the self-contained Goal entity: CRUD + hierarchy + default-goal resolution +
  the pure issue→goal fallback resolvers (ported verbatim, with tests). **We do NOT rewire the Task
  create/update path** in v1 — the fallback resolvers are ported pure + tested, ready for a follow-up
  slice that adds `Task.goalId`. This keeps the migration to a single new table and the hot task path
  untouched.
- **D3 (parity delta — cycle guard)** — Paperclip does not guard against a goal being re-parented under
  its own descendant (an orphaned cycle). We add `assertNoCycle` on create/update — a correctness
  improvement, not a behavior change for valid input.
- **D4** — `ownerAgentId` is a real nullable FK → `Agent` (`onDelete: SetNull`). `parentId` is a
  nullable self-FK (`onDelete: SetNull` — deleting a parent orphans children to root, matching
  Paperclip's non-cascading delete).
- **D5 (deviation)** — Paperclip writes an activity-log row on every goal mutation. We omit generic
  activity logging in v1 (consistent with prior epics); it can be layered later.

## 1. Requirements
- **R1.** `Goal { workspaceId, title, description?, level, status, parentId?, ownerAgentId? }`.
  `level ∈ {company, team, task}` (default `task`); `status ∈ {planned, active, completed, archived}`
  (default `planned`).
- **R2.** CRUD: `listGoals(workspaceId)`, `getGoal(workspaceId, id)`, `createGoal`, `updateGoal`,
  `deleteGoal` — all workspace-scoped.
- **R3.** `resolveDefaultGoal(workspaceId)` returns, in order: the oldest **active** root company goal
  → any oldest root company goal → any oldest company goal → null (faithful to `getDefaultCompanyGoal`).
- **R4.** Pure `resolveIssueGoalId` / `resolveNextIssueGoalId` ported verbatim from
  `issue-goal-fallback.ts` (goal → project goal → default goal precedence), with the Paperclip tests.
- **R5.** `createGoal`/`updateGoal` validate: `parentId` (if set) must be an existing goal in the same
  workspace, and re-parenting must not create a cycle (`assertNoCycle`) — else `BAD_USER_INPUT`.
- **R6.** All operations gated by `requireFeature(FLAG_KEYS.GOALS)`; workspace-isolated. Read + write
  are `member` (matches Paperclip's per-company access; goals are low blast-radius).

## 2. Non-goals / guardrails
- **DO NOT** rewire Task/issue creation onto goals in v1 (D2).
- **DO NOT** FK `workspaceId`.
- **DO NOT** allow a `parentId` from another workspace, or a cycle.
- **DO NOT** cascade-delete children when a parent is removed (orphan to root, per Paperclip).

## 3. Data model — `packages/database/prisma/schema/goal.prisma`
```prisma
enum GoalLevel { company team task }
enum GoalStatus { planned active completed archived }

model Goal {
  id            String     @id @default(cuid())
  workspaceId   String
  title         String
  description   String?
  level         GoalLevel  @default(task)
  status        GoalStatus @default(planned)
  parentId      String?
  parent        Goal?      @relation("GoalTree", fields: [parentId], references: [id], onDelete: SetNull)
  children      Goal[]     @relation("GoalTree")
  ownerAgentId  String?
  ownerAgent    Agent?     @relation("AgentGoals", fields: [ownerAgentId], references: [id], onDelete: SetNull)
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
  @@index([workspaceId, level, status])
  @@index([workspaceId, parentId])
  @@map("goals")
}
```
Adds back-relation `goals Goal[] @relation("AgentGoals")` to `Agent`.

## 4-8. API / migration / files
- **Flag** `FLAG_KEYS.GOALS` (default true; startup seed). Migration `add_goals` (1 table, 2 enums).
- **Service** `services/goals.ts`: `listGoals`, `getGoal`, `createGoal`, `updateGoal`, `deleteGoal`,
  `resolveDefaultGoal`, pure `assertNoCycle(goals, id, parentId)`. `services/issue-goal-fallback.ts`:
  pure `resolveIssueGoalId`, `resolveNextIssueGoalId` (verbatim port).
- **GraphQL** `types/goal.ts` (Goal prismaObject + owner/parent/children relations); queries `goals`,
  `goal(id)`, `defaultGoal`; mutations `createGoal`, `updateGoal`, `deleteGoal`.
- **UI** `/goals`: hierarchical tree (indent by parent), create/edit (title, level, status, owner
  agent, parent), delete.

## 9. Implementation order
1. Schema + migration + flag. 2. Service + pure resolvers + unit tests. 3. GraphQL + integration
tests. 4. UI + client + nav.

## 10. Test cases
- Unit: `resolveIssueGoalId`/`resolveNextIssueGoalId` (ported Paperclip cases); `assertNoCycle`
  (rejects self-parent + descendant-parent, allows valid re-parent).
- Integration: CRUD round-trip; hierarchy (create child under parent, list returns tree); default-goal
  resolution precedence (active root > any root > any); cross-workspace parent rejected; cycle rejected;
  isolation (WS_A can't see WS_B goals); gate (GOALS off → error); owner agent set/cleared.

## 11. Definition of Done
Hierarchical goals CRUD workspace-scoped + agent-owned; default-goal resolution faithful to Paperclip;
pure fallback resolvers ported + tested; cycle/cross-workspace parent rejected; gated by GOALS + role;
unit+integration green.

## 12. Risks
- **Cycle in the tree** → `assertNoCycle` walks ancestors before write.
- **Cross-workspace parent** → validated against a workspace-scoped fetch.
- **Orphaned children on delete** → `onDelete: SetNull` (children re-root), matching Paperclip.
