-- Decision training capture (parity #40).
CREATE TABLE "decision_records" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "agentId" TEXT, "taskId" TEXT,
  "decisionType" TEXT NOT NULL, "context" TEXT NOT NULL, "choice" TEXT NOT NULL,
  "rationale" TEXT, "outcome" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "decision_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "decision_records_workspaceId_decisionType_createdAt_idx" ON "decision_records"("workspaceId", "decisionType", "createdAt");
CREATE INDEX "decision_records_workspaceId_agentId_createdAt_idx" ON "decision_records"("workspaceId", "agentId", "createdAt");
