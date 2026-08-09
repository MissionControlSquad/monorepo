-- CreateTable
CREATE TABLE "memory_jobs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceRefId" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memory_jobs_status_leaseExpiresAt_idx" ON "memory_jobs"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "memory_jobs_workspaceId_agentId_idx" ON "memory_jobs"("workspaceId", "agentId");
