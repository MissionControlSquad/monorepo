-- Epic #18: agent instruction bundles (AGENTS.md). 1 table.

CREATE TABLE "agent_instructions" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "updatedByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_instructions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_instructions_agentId_fileName_key" ON "agent_instructions"("agentId", "fileName");
CREATE INDEX "agent_instructions_agentId_idx" ON "agent_instructions"("agentId");

ALTER TABLE "agent_instructions" ADD CONSTRAINT "agent_instructions_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
