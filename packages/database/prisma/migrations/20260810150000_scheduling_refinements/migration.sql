-- §3 #11 scheduling refinements. All additive + nullable-or-defaulted (safe, reversible), so existing
-- rows keep working and behavior only changes when the new controls are set / their flags are on.
--
--   (1) Agent.maxConcurrentRuns — optional per-agent in-flight cap the sandbox run-queue drain honors
--       (never starts a run for an agent already at this many running runs). NULL = unlimited.
--   (1) AgentRun.priority — dispatch priority; the drain orders queued runs priority DESC then
--       createdAt ASC. Backfills to 0 (unchanged FIFO order for existing rows). Index supports the scan.
--   (2) RoutineTrigger.concurrencyPolicy — allow | skip | queue overlap of a still-active prior run.
--   (2) RoutineTrigger.catchUpPolicy    — skip | run_once on a missed (downtime) tick window.
--
-- Rollback:
--   DROP INDEX "agent_runs_status_kind_priority_createdAt_idx";
--   ALTER TABLE "agent_runs"       DROP COLUMN "priority";
--   ALTER TABLE "agents"           DROP COLUMN "maxConcurrentRuns";
--   ALTER TABLE "routine_triggers" DROP COLUMN "concurrencyPolicy";
--   ALTER TABLE "routine_triggers" DROP COLUMN "catchUpPolicy";

ALTER TABLE "agents" ADD COLUMN "maxConcurrentRuns" INTEGER;

ALTER TABLE "agent_runs" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "agent_runs_status_kind_priority_createdAt_idx" ON "agent_runs"("status", "kind", "priority", "createdAt");

ALTER TABLE "routine_triggers" ADD COLUMN "concurrencyPolicy" TEXT NOT NULL DEFAULT 'allow';

ALTER TABLE "routine_triggers" ADD COLUMN "catchUpPolicy" TEXT NOT NULL DEFAULT 'skip';
