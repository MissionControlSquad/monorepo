-- Tier D keystone: AgentRun run ledger (every agent execution is persisted).
CREATE TABLE "agent_runs" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "agentId" TEXT,
  "taskId" TEXT,
  "kind" TEXT NOT NULL,
  "providerKey" TEXT,
  "sandboxId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'running',
  "exitCode" INTEGER,
  "stdout" TEXT,
  "stderr" TEXT,
  "errorMessage" TEXT,
  "costCents" INTEGER,
  "requestedByProfileId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_runs_workspaceId_createdAt_idx" ON "agent_runs"("workspaceId", "createdAt");
CREATE INDEX "agent_runs_agentId_idx" ON "agent_runs"("agentId");
CREATE INDEX "agent_runs_taskId_idx" ON "agent_runs"("taskId");
CREATE INDEX "agent_runs_status_idx" ON "agent_runs"("status");
