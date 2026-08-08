-- Proactive agent-wake substrate: a DB-backed, coalescing per-agent wake queue (parity:
-- agentWakeupRequests + heartbeat.wakeup). Brand-new table, so NOT NULL columns are safe at create
-- (no existing rows to violate). Reversible: DROP TABLE + DROP TYPE.

-- CreateEnum
CREATE TYPE "AgentWakeupStatus" AS ENUM ('queued', 'delivered', 'suppressed');

-- CreateTable
CREATE TABLE "agent_wakeups" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "agentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AgentWakeupStatus" NOT NULL DEFAULT 'queued',
    "coalescedCount" INTEGER NOT NULL DEFAULT 1,
    "dedupeKey" TEXT NOT NULL,
    "notBefore" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "agent_wakeups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_wakeups_agentId_status_idx" ON "agent_wakeups"("agentId", "status");
CREATE INDEX "agent_wakeups_status_notBefore_idx" ON "agent_wakeups"("status", "notBefore");
CREATE INDEX "agent_wakeups_workspaceId_idx" ON "agent_wakeups"("workspaceId");

-- Coalescing guarantee: at most one QUEUED row per (agentId + reason) dedupe key. Partial so a
-- delivered/suppressed row never blocks a fresh wake for the same key. Postgres native partial unique
-- index (not expressible in the Prisma schema), which is what makes the coalescing upsert atomic.
CREATE UNIQUE INDEX "agent_wakeups_dedupe_queued_uq" ON "agent_wakeups"("dedupeKey") WHERE "status" = 'queued';
