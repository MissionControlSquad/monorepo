-- CreateTable
CREATE TABLE "workspace_runtime_services" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "executionWorkspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "port" INTEGER,
    "reuseKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'stopped',
    "healthCheckUrl" TEXT,
    "healthStatus" TEXT,
    "lastHealthAt" TIMESTAMP(3),
    "stopPolicy" TEXT NOT NULL DEFAULT 'on_run_end',
    "pid" INTEGER,
    "providerRef" TEXT,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "stopReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_runtime_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_runtime_services_workspaceId_status_idx" ON "workspace_runtime_services"("workspaceId", "status");
CREATE INDEX "workspace_runtime_services_executionWorkspaceId_status_idx" ON "workspace_runtime_services"("executionWorkspaceId", "status");
CREATE INDEX "workspace_runtime_services_stopPolicy_status_lastUsedAt_idx" ON "workspace_runtime_services"("stopPolicy", "status", "lastUsedAt");

-- Partial-unique on (executionWorkspaceId, reuseKey): only ONE LIVE service per reuseKey per execution
-- workspace. Stopped rows (stopped | stopped_failed) are excluded so a reuseKey can be re-used over
-- time. This is the DB-level guard behind the service's reuse-by-reuseKey dedupe.
CREATE UNIQUE INDEX "workspace_runtime_services_live_reuse_key"
    ON "workspace_runtime_services"("executionWorkspaceId", "reuseKey")
    WHERE "status" NOT IN ('stopped', 'stopped_failed');

-- AddForeignKey
ALTER TABLE "workspace_runtime_services" ADD CONSTRAINT "workspace_runtime_services_executionWorkspaceId_fkey" FOREIGN KEY ("executionWorkspaceId") REFERENCES "execution_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
