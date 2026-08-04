-- Continuation summaries (parity #142/#156/#157): rolling context summaries carried between runs.
CREATE TABLE "summary_slots" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "agentId" TEXT NOT NULL,
  "slotKey" TEXT NOT NULL DEFAULT 'context', "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft', "runId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "summary_slots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "summary_slots_workspaceId_agentId_slotKey_status_idx" ON "summary_slots"("workspaceId", "agentId", "slotKey", "status");
