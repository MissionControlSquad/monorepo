-- Tier D / Domain 4 (Memory GAP-A/-C): operations audit log + company binding default,
-- plus richer provenance on agent_memories. Additive only.

-- GAP-A: memory operations audit log (the surface cost + inspect hang off).
CREATE TABLE "memory_operations" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "agentId" TEXT,
  "provider" TEXT NOT NULL,
  "opType" TEXT NOT NULL,
  "projectId" TEXT,
  "taskId" TEXT,
  "runId" TEXT,
  "subjectId" TEXT,
  "sourceKind" TEXT,
  "sourceRefId" TEXT,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "error" TEXT,
  "latencyMs" INTEGER,
  "resultCount" INTEGER,
  "inputTokens" INTEGER,
  "embeddingTokens" INTEGER,
  "outputTokens" INTEGER,
  "costCents" INTEGER,
  "attributionMode" TEXT,
  "costEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memory_operations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "memory_operations_workspaceId_agentId_createdAt_idx" ON "memory_operations"("workspaceId", "agentId", "createdAt");
CREATE INDEX "memory_operations_workspaceId_opType_createdAt_idx" ON "memory_operations"("workspaceId", "opType", "createdAt");

-- GAP-C: company-wide default memory provider (one row per workspace).
CREATE TABLE "workspace_memory_settings" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "defaultProvider" TEXT NOT NULL DEFAULT 'none',
  "updatedByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_memory_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workspace_memory_settings_workspaceId_key" ON "workspace_memory_settings"("workspaceId");

-- Richer provenance on the db-provider content rows (feature 20).
ALTER TABLE "agent_memories" ADD COLUMN "sourceKind" TEXT;
ALTER TABLE "agent_memories" ADD COLUMN "sourceRefId" TEXT;
