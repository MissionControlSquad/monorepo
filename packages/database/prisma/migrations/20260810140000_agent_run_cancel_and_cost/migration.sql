-- §3 #2 run cancellation + sandbox cost population. Additive + nullable (safe, reversible):
--   • cancelReason — human-readable reason stamped when a run is canceled (queued-cancel or an
--     in-flight AbortSignal kill); pairs with exitReason="canceled". Existing rows backfill to NULL.
--   • costStatus   — pricing status of costCents: "reported" (priced from the rate card) | "unpriced"
--     (unknown model → costCents 0, repriceable later). Existing rows backfill to NULL (no cost run).
-- Rollback: DROP COLUMN "cancelReason"; DROP COLUMN "costStatus";
ALTER TABLE "agent_runs" ADD COLUMN "cancelReason" TEXT;

ALTER TABLE "agent_runs" ADD COLUMN "costStatus" TEXT;
