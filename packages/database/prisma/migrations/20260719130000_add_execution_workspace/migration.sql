-- Tier D / Phase 3 (Plan 3): project workspaces, execution workspaces, workspace operations.
CREATE TABLE "project_workspaces" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'repo',
  "cwd" TEXT,
  "repoUrl" TEXT,
  "repoRef" TEXT,
  "defaultRef" TEXT,
  "setupCommand" TEXT,
  "cleanupCommand" TEXT,
  "defaultStrategy" TEXT,
  "remoteProvider" TEXT,
  "remoteWorkspaceRef" TEXT,
  "sharedWorkspaceKey" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_workspaces_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_workspaces_projectId_name_key" ON "project_workspaces"("projectId", "name");
CREATE INDEX "project_workspaces_workspaceId_projectId_idx" ON "project_workspaces"("workspaceId", "projectId");

CREATE TABLE "execution_workspaces" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT,
  "projectWorkspaceId" TEXT,
  "taskId" TEXT,
  "runId" TEXT,
  "mode" TEXT NOT NULL DEFAULT 'run',
  "strategyType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "cwd" TEXT,
  "repoUrl" TEXT,
  "baseRef" TEXT,
  "branchName" TEXT,
  "providerType" TEXT NOT NULL DEFAULT 'local_fs',
  "providerRef" TEXT,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "execution_workspaces_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "execution_workspaces_workspaceId_projectId_status_idx" ON "execution_workspaces"("workspaceId", "projectId", "status");
CREATE INDEX "execution_workspaces_runId_idx" ON "execution_workspaces"("runId");

CREATE TABLE "workspace_operations" (
  "id" TEXT NOT NULL,
  "executionWorkspaceId" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "command" TEXT,
  "exitCode" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'done',
  "detail" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "workspace_operations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "workspace_operations_executionWorkspaceId_idx" ON "workspace_operations"("executionWorkspaceId");
ALTER TABLE "workspace_operations" ADD CONSTRAINT "workspace_operations_executionWorkspaceId_fkey" FOREIGN KEY ("executionWorkspaceId") REFERENCES "execution_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
