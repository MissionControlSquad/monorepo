-- Tier D robustness: attempt-count + dead-letter for un-acked live deliveries.
ALTER TABLE "live_pending_deliveries" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "live_pending_deliveries" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "live_pending_deliveries" ADD COLUMN "deadLetteredAt" TIMESTAMP(3);
