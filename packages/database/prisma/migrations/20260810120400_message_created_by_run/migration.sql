-- Parity §3.12: attribute a task comment to the agent run that posted it. Additive nullable FK to
-- agent_runs (SET NULL on run delete so a comment outlives its run). Existing messages backfill to
-- NULL (human/API-authored). Indexed for "messages by run" lookups.
ALTER TABLE "messages" ADD COLUMN "createdByRunId" TEXT;

CREATE INDEX "messages_createdByRunId_idx" ON "messages"("createdByRunId");

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_createdByRunId_fkey"
  FOREIGN KEY ("createdByRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
