-- Domain 12 GAP-6 A13: unpriced cost state for provider-cost-pending events.
ALTER TABLE "cost_events" ADD COLUMN "costStatus" TEXT NOT NULL DEFAULT 'reported';
