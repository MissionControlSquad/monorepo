-- CreateTable
CREATE TABLE "subtree_watchdogs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "watchdogAgentProfileId" TEXT,
    "lastReviewedFingerprint" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subtree_watchdogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_watchdog_decisions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "silenceMs" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_watchdog_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one ACTIVE watchdog per task (partial unique).
CREATE UNIQUE INDEX "subtree_watchdogs_taskId_active_key" ON "subtree_watchdogs"("taskId") WHERE "active";
CREATE INDEX "subtree_watchdogs_workspaceId_active_idx" ON "subtree_watchdogs"("workspaceId", "active");
CREATE INDEX "run_watchdog_decisions_workspaceId_runId_createdAt_idx" ON "run_watchdog_decisions"("workspaceId", "runId", "createdAt");
