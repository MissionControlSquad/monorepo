-- Tier D / Phase 3 (Plan 4): per-workspace execution policy/allowlist.
CREATE TABLE "workspace_execution_policies" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "executionMode" TEXT NOT NULL DEFAULT 'any',
  "enableIsolatedWorkspaces" BOOLEAN NOT NULL DEFAULT false,
  "updatedByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_execution_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workspace_execution_policies_workspaceId_key" ON "workspace_execution_policies"("workspaceId");
