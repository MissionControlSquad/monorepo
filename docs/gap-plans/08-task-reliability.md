# Epic #8 — Task reliability / autonomy

**Phase:** 3 (Autonomy) · **Gap:** 🟠 Medium
**Dependencies:** #1 (Organization / OrgRole / `require-role.ts`); builds on the existing task
lifecycle, `AgentQueueItem`, and the auto-sleep/heartbeat cron.

AgentCenter has a solid lifecycle (`TaskStatus`, `parentTaskId` hierarchy, `blockedByTaskId` deps,
`TaskAssignee`, `AgentQueueItem`, `WorkSession`, `StatusHistory`, `agentHeartbeat` + auto-sleep cron)
but no autonomy-hardening. We port Paperclip's **atomic issue checkout**, **watchdogs**, **recovery
actions**, **plan decomposition**, **tree holds**, and **run-liveness**, emphasizing DB-level
atomicity for checkout.

---

## Target model
```
Task (existing)  ──+ checkout columns (lease-based, race-free claim)
 ├─ checkedOutByProfileId, checkedOutAt, checkoutLeaseExpiresAt, checkoutToken
 ├─ TaskTreeHold?          (pause a whole subtree — pause guard)
 ├─ PlanDecomposition[]    (parent task → generated subtask plan w/ review gate)
 └─ parentTaskId / blockedByTaskId  (REUSED for tree + deps)

TaskWatchdog (scope + condition + action)
 └─ WatchdogDecision[]     (fired evaluation → decision + outcome)

TaskRecoveryAction         (detected stuck run → attempted resolution)
```

## Schema changes — `packages/database/prisma/schema/`
Edit `task.prisma` → `Task`, add lease-checkout columns:
```prisma
  checkedOutByProfileId  String?
  checkedOutAt           DateTime?
  checkoutLeaseExpiresAt DateTime?          // lease TTL; expired lease is reclaimable
  checkoutToken          String?            // opaque fencing token per checkout

  checkedOutBy    Profile?             @relation("TaskCheckedOutBy", fields: [checkedOutByProfileId], references: [id], onDelete: SetNull)
  watchdogs       TaskWatchdog[]
  decompositions  PlanDecomposition[]
  treeHold        TaskTreeHold?
  recoveryActions TaskRecoveryAction[]

  @@index([checkedOutByProfileId])
  @@index([checkoutLeaseExpiresAt])          // liveness/recovery scan predicate
```

New file `task-autonomy.prisma`:
```prisma
enum WatchdogScope { task subtree agent }
enum WatchdogCondition { lease_expired no_heartbeat no_progress stuck_in_status }
enum WatchdogActionType { release_checkout reassign escalate pause_subtree notify }
enum WatchdogDecisionOutcome { no_action action_taken action_failed }
enum RecoveryStatus { detected attempting resolved failed }
enum DecompositionStatus { proposed approved rejected applied }

model TaskWatchdog {
  id           String            @id @default(cuid())
  taskId       String
  scope        WatchdogScope     @default(task)
  condition    WatchdogCondition
  thresholdSec Int
  action       WatchdogActionType
  isEnabled    Boolean           @default(true)
  createdAt    DateTime          @default(now())

  task      Task               @relation(fields: [taskId], references: [id], onDelete: Cascade)
  decisions WatchdogDecision[]

  @@index([taskId])
  @@index([isEnabled, condition])
  @@map("task_watchdogs")
}

model WatchdogDecision {
  id         String                  @id @default(cuid())
  watchdogId String
  taskId     String
  outcome    WatchdogDecisionOutcome
  reason     String
  metadata   Json?
  createdAt  DateTime                @default(now())

  watchdog TaskWatchdog @relation(fields: [watchdogId], references: [id], onDelete: Cascade)

  @@index([watchdogId, createdAt])
  @@index([taskId, createdAt])
  @@map("watchdog_decisions")
}

model TaskRecoveryAction {
  id          String         @id @default(cuid())
  taskId      String
  detectedBy  String                                 // "cron" | watchdogId
  reason      String
  status      RecoveryStatus @default(detected)
  resolution  String?
  attemptedAt DateTime?
  resolvedAt  DateTime?
  createdAt   DateTime       @default(now())

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([taskId])
  @@index([status])
  @@index([createdAt])
  @@map("task_recovery_actions")
}

model PlanDecomposition {
  id                  String              @id @default(cuid())
  parentTaskId        String
  status              DecompositionStatus @default(proposed)
  plan                Json                                 // [{title, description, priority?, tags?}] — same shape as TaskTemplate.subtasks
  generatedByAgentId  String?
  reviewedByProfileId String?
  appliedAt           DateTime?
  createdAt           DateTime            @default(now())

  parentTask Task @relation(fields: [parentTaskId], references: [id], onDelete: Cascade)

  @@index([parentTaskId])
  @@index([status])
  @@map("plan_decompositions")
}

model TaskTreeHold {
  id              String   @id @default(cuid())
  rootTaskId      String   @unique                         // one active hold per subtree root
  reason          String
  heldByProfileId String?
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  releasedAt      DateTime?

  rootTask Task @relation(fields: [rootTaskId], references: [id], onDelete: Cascade)

  @@index([isActive])
  @@map("task_tree_holds")
}
```
Edit `agent.prisma` — `Profile` gets `checkedOutTasks Task[] @relation("TaskCheckedOutBy")`.

## Reuse analysis (don't reinvent)
- **Checkout builds on existing `Task` — no new checkout table.** Columns added directly to `Task` because checkout is a 1:1 lease and a conditional `UPDATE ... WHERE lease-free` is atomic without a join. **Genuinely new** models are only `TaskWatchdog`/`WatchdogDecision`/`TaskRecoveryAction`/`PlanDecomposition`/`TaskTreeHold`.
- **Agent auth — reuse.** Checkout/renew/release reuse `resolveByApiKey` (the path `agentHeartbeat` uses).
- **Hierarchy + deps — reuse.** Tree holds + decomposition reuse `Task.parentTaskId`; diagnostics reuse `Task.blockedByTaskId`.
- **`AgentQueueItem` — reuse concept.** `QueueItemType.task_breakdown`, `autoGenerated`/`generatedFrom`/`parentQueueItemId` already exist; `PlanDecomposition.plan` uses the same `[{title,description,priority?,tags?}]` shape as `TaskTemplate.subtasks`; `applyDecomposition` uses the same `taskModel.create` path as `generateRecurringTasks`.
- **Liveness — reuse `WorkSession`/`StatusHistory`/`lastHeartbeat`.** The liveness cron clones the guard + stale-recheck loop from `api/cron/auto-sleep/route.ts` (`findStaleAgents`/`isAgentStill`).
- **Events — reuse `events/bus.ts` + `EventTypes`.**

## GraphQL / REST / Backend / UI
- **GraphQL:** `task-checkout.ts` — mutations `checkoutTask(taskId, leaseSeconds)` (atomic; returns `checkoutToken`), `renewCheckout`, `releaseCheckout` (reuse `resolveByApiKey`). `task-watchdog.ts`/`plan-decomposition.ts`/`task-tree-hold.ts` — CRUD + `proposeDecomposition`, `reviewDecomposition`, `applyDecomposition`, `holdSubtree`, `releaseSubtreeHold`. Expose checkout fields on `Task`.
- **REST:** `api/tasks/checkout/route.ts` (POST atomic checkout for REST agents); `api/tasks/[id]/diagnostics/route.ts` (read-only blockers/wakes/subtree, parallels the blocker-diagnostics endpoint at commit `295294d`); `api/cron/task-liveness/route.ts` (CRON_SECRET guard).
- **Backend:** `task-checkout.ts` (atomic conditional UPDATE, below), `task-watchdog.ts` (`evaluateWatchdogs`), `task-recovery.ts` (`detectStuckRuns`/`attemptRecovery`), `plan-decomposition.ts` (`applyDecomposition` → child Tasks via `taskModel.create`), `task-tree-hold.ts` (`isUnderHold` ancestor walk = pause guard). New `EventTypes`: `TASK_CHECKED_OUT`, `TASK_CHECKOUT_RELEASED`, `TASK_RECOVERY_TRIGGERED`, `TASK_SUBTREE_HELD`.

Atomic checkout (single conditional UPDATE, no interactive transaction):
```ts
const [claimed] = await prisma.$queryRaw`
  UPDATE tasks
     SET "checkedOutByProfileId" = ${profileId},
         "checkedOutAt" = now(),
         "checkoutLeaseExpiresAt" = now() + ${leaseSeconds} * interval '1 second',
         "checkoutToken" = ${token}
   WHERE id = ${taskId}
     AND ("checkedOutByProfileId" IS NULL OR "checkoutLeaseExpiresAt" < now())
   RETURNING id, "checkoutToken"`;
if (!claimed) throw new Error("Task already checked out");
// renew/release additionally match  AND "checkoutToken" = $token  (fencing)
```
- **UI:** `task/[id]` "Reliability" panel (checkout/lease badge, watchdog list, recovery history, decomposition review gate, subtree-hold toggle); `settings/reliability/` (org-level default watchdog policies). Mobile read-only + approve-decomposition.

## Feature-flag + license
- Flag `task_autonomy` via `isFeatureEnabled`; seed in `seed-flags.ts`. License feature `autonomy` (pro/enterprise). Base task lifecycle keeps working when off (safe additive gate).

## Migration script (end-to-end)
```bash
cd packages/database
pnpm db:migrate --name add_task_autonomy
#   ALTER TABLE tasks ADD COLUMN "checkedOutByProfileId" text, "checkedOutAt" timestamp(3),
#     "checkoutLeaseExpiresAt" timestamp(3), "checkoutToken" text;
#   CREATE INDEX tasks_checkedOutByProfileId_idx, tasks_checkoutLeaseExpiresAt_idx;
#   + CREATE TABLE task_watchdogs, watchdog_decisions, task_recovery_actions,
#     plan_decompositions, task_tree_holds + enums.

# Backfill: existing tasks have no active checkout — columns default to NULL (correct
# "not checked out" state). No UPDATE needed.

# Columns stay nullable (a free task legitimately has NULL owner) — NO nullable→NOT NULL
# follow-up. Atomicity is enforced by the conditional UPDATE predicate, not a constraint.

pnpm db:seed                # inserts flag "task_autonomy"
pnpm db:migrate:deploy
```
`ALTER TABLE ADD COLUMN` (nullable, no default) is metadata-only in Postgres → non-blocking on a large `tasks` table. **Rollback:** `prisma migrate resolve --rolled-back <ts>_add_task_autonomy`, drop the five new tables/enums, then drop the four checkout columns.

## Test cases
**Unit (`apps/web/tests/unit`, `vitest.unit-no-db.config.ts`):**
- `checkout-lease.spec.ts` — lease-expiry predicate math (expired vs live); `checkoutToken` fencing comparison.
- `tree-hold-guard.spec.ts` — `isUnderHold` ancestor-walk returns true when any ancestor holds, false otherwise (pure, mocked tree).
- `decomposition-plan.spec.ts` — plan JSON validates against the `{title,description,priority?,tags?}` shape.

**Integration (GraphQL + DB, `vitest.config.ts`):**
- **Concurrency (core):** `checkout-race.int.spec.ts` — **two agents `checkoutTask` the same free task in parallel → exactly one wins**; the other throws "already checked out"; assert DB owner == winner via returned token.
- `checkout-lease-reclaim.int.spec.ts` — a task with expired lease is reclaimable by a second agent; a live lease is not.
- `checkout-fencing.int.spec.ts` — renew/release with a stale `checkoutToken` rejected.
- **Watchdog:** `watchdog-recovery.int.spec.ts` — **watchdog fires recovery when a run exceeds its lease TTL**: seed an expired-lease task, run `evaluateWatchdogs`, assert `WatchdogDecision(action_taken)` + `TaskRecoveryAction(detected→resolved)` and checkout released.
- `liveness-cron.int.spec.ts` — the cron creates a `TaskRecoveryAction` for a task whose owner's `lastHeartbeat` is stale.
- `decomposition-review-gate.int.spec.ts` — `applyDecomposition` creates child Tasks under `parentTaskId` only after `reviewDecomposition(approve)`; rejected proposals create nothing.
- `subtree-hold.int.spec.ts` — with an active `TaskTreeHold` on a root, `checkoutTask` on a descendant is refused and `generateRecurringTasks` skips it.
- `diagnostics.int.spec.ts` — read-only diagnostics returns blockers (`blockedByTaskId` chain), wakes (`StatusHistory`), subtree descendants.

**E2E (`apps/web/tests/e2e`):** `task-autonomy.e2e.ts` — agent checks out via `POST /api/tasks/checkout`, lease expires, liveness cron recovers it, a second agent re-checks-out.

## Best-approach confirmation
Enforcing checkout atomicity with a **single conditional `UPDATE ... WHERE checkedOutByProfileId IS
NULL OR checkoutLeaseExpiresAt < now()`** plus a fencing token is the right fit: it is atomic in one
round-trip on the existing `tasks` row, needs no explicit transaction/advisory lock, and composes with
Prisma's pooling and stateless Next.js route handlers. **Rejected:** `SELECT ... FOR UPDATE` in an
interactive transaction (holds a row lock across the app round-trip — contention/pool-exhaustion under
many polling agents, awkward with Prisma's txn API) and a separate `TaskCheckout` table (a 1:1 lease
adds a join with no atomicity benefit). Lease-with-TTL + watchdog recovery mirrors the proven
auto-sleep/heartbeat staleness pattern, reusing a validated model rather than a new coordination mechanism.

## Acceptance checklist
- [ ] Two agents calling `checkoutTask` on the same free task → exactly one gets a token; the other rejected.
- [ ] An expired lease is reclaimable; a live lease is not.
- [ ] renew/release require the matching `checkoutToken` (fencing).
- [ ] Liveness cron creates a `TaskRecoveryAction` when a lease expires or the owner's heartbeat is stale.
- [ ] A watchdog whose condition holds records a `WatchdogDecision` and performs its action.
- [ ] `applyDecomposition` creates child Tasks under `parentTaskId` only after review approval.
- [ ] A subtree hold blocks checkout + recurring generation on all descendants.
- [ ] Diagnostics returns blockers, wakes, and subtree read-only.
- [ ] Feature hidden when flag off or license lacks `autonomy`.

## Risks
- Atomic checkout depends on the conditional UPDATE — keep the statement short; cover with a concurrency test.
- Lease TTL tuning: too short reaps live work, too long delays recovery — make `leaseSeconds` configurable and renew on every liveness signal.
- Watchdog actions can cascade (pause → requeue → escalate) — require idempotency (dedupe on open `TaskRecoveryAction` per task) and a per-run action cap.
- Wiring liveness into `cron/auto-sleep` couples concerns — split into a dedicated `cron/task-liveness` route if it grows heavy.
- Auto-applying agent-generated decompositions is high-blast-radius — keep the review gate defaulted on; never bypass in production.
