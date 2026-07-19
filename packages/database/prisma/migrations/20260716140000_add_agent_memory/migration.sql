-- Tier D: two-layer agent memory — provider binding + control-plane-stored entries with provenance.
ALTER TABLE "agents" ADD COLUMN "memoryProvider" TEXT NOT NULL DEFAULT 'none';

CREATE TABLE "agent_memories" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_memories_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_memories_workspaceId_agentId_createdAt_idx" ON "agent_memories"("workspaceId", "agentId", "createdAt");
