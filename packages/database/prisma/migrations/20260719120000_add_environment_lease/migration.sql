-- Tier D / Phase 3 (Plan 2): environment leases (leased, reusable, recoverable runs).
CREATE TABLE "environment_leases" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "environmentId" TEXT NOT NULL,
  "taskId" TEXT,
  "runId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "leasePolicy" TEXT NOT NULL DEFAULT 'ephemeral',
  "provider" TEXT,
  "providerLeaseId" TEXT,
  "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "cleanupStatus" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "environment_leases_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "environment_leases_workspaceId_environmentId_status_idx" ON "environment_leases"("workspaceId", "environmentId", "status");
CREATE INDEX "environment_leases_status_expiresAt_idx" ON "environment_leases"("status", "expiresAt");
ALTER TABLE "environment_leases" ADD CONSTRAINT "environment_leases_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
