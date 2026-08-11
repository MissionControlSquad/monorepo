-- Memory residuals (§3 memory): the declared-but-missing op-types (memory.correct / memory.record_upsert)
-- need durable state on agent_memories. All columns are ADDITIVE + NULLABLE — no backfill, no rewrite,
-- fully backward-compatible (existing rows read as live, un-keyed entries). updatedAt defaults to now()
-- so pre-existing rows get a sensible value without a backfill pass.

-- correct: mark the OLD entry superseded by the NEW correcting entry (preserving both for the audit trail).
ALTER TABLE "agent_memories" ADD COLUMN "supersededById" TEXT;
ALTER TABLE "agent_memories" ADD COLUMN "supersededAt" TIMESTAMP(3);

-- record_upsert: a stable app-supplied key that dedupes a keyed record per (workspace, agent).
ALTER TABLE "agent_memories" ADD COLUMN "recordKey" TEXT;

-- updatedAt: touched on correct/upsert; default now() so existing rows backfill implicitly.
ALTER TABLE "agent_memories" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex: idempotent upsert lookup + list scans by (workspace, agent, recordKey).
CREATE INDEX "agent_memories_workspaceId_agentId_recordKey_idx" ON "agent_memories"("workspaceId", "agentId", "recordKey");
