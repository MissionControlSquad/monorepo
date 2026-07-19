-- Tier D / Phase 3 keystone: first-class Environment model (where/how a run executes).
CREATE TABLE "environments" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "driver" TEXT NOT NULL DEFAULT 'local',
  "status" TEXT NOT NULL DEFAULT 'active',
  "config" JSONB NOT NULL DEFAULT '{}',
  "envVars" JSONB NOT NULL DEFAULT '{}',
  "metadata" JSONB,
  "createdByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "environments_workspaceId_name_key" ON "environments"("workspaceId", "name");
CREATE INDEX "environments_workspaceId_status_idx" ON "environments"("workspaceId", "status");

-- Partial-unique guards (mirror Paperclip environments.ts): at most one default `local` env and one
-- managed `sandbox` env per workspace. Managed = metadata->>'managed' = 'true'.
CREATE UNIQUE INDEX "environments_one_local_per_workspace"
  ON "environments"("workspaceId")
  WHERE "driver" = 'local';

CREATE UNIQUE INDEX "environments_one_managed_sandbox_per_workspace"
  ON "environments"("workspaceId")
  WHERE "driver" = 'sandbox' AND ("metadata" ->> 'managed') = 'true';
