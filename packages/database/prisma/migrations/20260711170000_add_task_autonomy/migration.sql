-- Epic #8: task autonomy. Lease-checkout columns on tasks (nullable, metadata-only ADD COLUMN) +
-- 5 new tables. No backfill (NULL = not-checked-out; atomicity is via the conditional UPDATE).

CREATE TYPE "WatchdogScope" AS ENUM ('task', 'subtree', 'agent');
CREATE TYPE "WatchdogCondition" AS ENUM ('lease_expired', 'no_heartbeat', 'no_progress', 'stuck_in_status');
CREATE TYPE "WatchdogActionType" AS ENUM ('release_checkout', 'reassign', 'escalate', 'pause_subtree', 'notify');
CREATE TYPE "WatchdogDecisionOutcome" AS ENUM ('no_action', 'action_taken', 'action_failed');
CREATE TYPE "RecoveryStatus" AS ENUM ('detected', 'attempting', 'resolved', 'failed');
CREATE TYPE "DecompositionStatus" AS ENUM ('proposed', 'approved', 'rejected', 'applied');

ALTER TABLE "tasks"
  ADD COLUMN "checkedOutByProfileId" TEXT,
  ADD COLUMN "checkedOutAt" TIMESTAMP(3),
  ADD COLUMN "checkoutLeaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "checkoutToken" TEXT;
CREATE INDEX "tasks_checkedOutByProfileId_idx" ON "tasks"("checkedOutByProfileId");
CREATE INDEX "tasks_checkoutLeaseExpiresAt_idx" ON "tasks"("checkoutLeaseExpiresAt");
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_checkedOutByProfileId_fkey"
  FOREIGN KEY ("checkedOutByProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "task_watchdogs" (
  "id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "scope" "WatchdogScope" NOT NULL DEFAULT 'task',
  "condition" "WatchdogCondition" NOT NULL, "thresholdSec" INTEGER NOT NULL,
  "action" "WatchdogActionType" NOT NULL, "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_watchdogs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_watchdogs_taskId_idx" ON "task_watchdogs"("taskId");
CREATE INDEX "task_watchdogs_isEnabled_condition_idx" ON "task_watchdogs"("isEnabled", "condition");

CREATE TABLE "watchdog_decisions" (
  "id" TEXT NOT NULL, "watchdogId" TEXT NOT NULL, "taskId" TEXT NOT NULL,
  "outcome" "WatchdogDecisionOutcome" NOT NULL, "reason" TEXT NOT NULL, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "watchdog_decisions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "watchdog_decisions_watchdogId_createdAt_idx" ON "watchdog_decisions"("watchdogId", "createdAt");
CREATE INDEX "watchdog_decisions_taskId_createdAt_idx" ON "watchdog_decisions"("taskId", "createdAt");

CREATE TABLE "task_recovery_actions" (
  "id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "detectedBy" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "status" "RecoveryStatus" NOT NULL DEFAULT 'detected', "resolution" TEXT,
  "attemptedAt" TIMESTAMP(3), "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_recovery_actions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_recovery_actions_taskId_idx" ON "task_recovery_actions"("taskId");
CREATE INDEX "task_recovery_actions_status_idx" ON "task_recovery_actions"("status");
CREATE INDEX "task_recovery_actions_createdAt_idx" ON "task_recovery_actions"("createdAt");

CREATE TABLE "plan_decompositions" (
  "id" TEXT NOT NULL, "parentTaskId" TEXT NOT NULL,
  "status" "DecompositionStatus" NOT NULL DEFAULT 'proposed', "plan" JSONB NOT NULL,
  "generatedByAgentId" TEXT, "reviewedByProfileId" TEXT, "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_decompositions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "plan_decompositions_parentTaskId_idx" ON "plan_decompositions"("parentTaskId");
CREATE INDEX "plan_decompositions_status_idx" ON "plan_decompositions"("status");

CREATE TABLE "task_tree_holds" (
  "id" TEXT NOT NULL, "rootTaskId" TEXT NOT NULL, "reason" TEXT NOT NULL, "heldByProfileId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  CONSTRAINT "task_tree_holds_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "task_tree_holds_rootTaskId_key" ON "task_tree_holds"("rootTaskId");
CREATE INDEX "task_tree_holds_isActive_idx" ON "task_tree_holds"("isActive");

ALTER TABLE "task_watchdogs" ADD CONSTRAINT "task_watchdogs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "watchdog_decisions" ADD CONSTRAINT "watchdog_decisions_watchdogId_fkey" FOREIGN KEY ("watchdogId") REFERENCES "task_watchdogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_recovery_actions" ADD CONSTRAINT "task_recovery_actions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_decompositions" ADD CONSTRAINT "plan_decompositions_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_tree_holds" ADD CONSTRAINT "task_tree_holds_rootTaskId_fkey" FOREIGN KEY ("rootTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
