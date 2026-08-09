-- Epic #4: split cost reporting by billing type (metered api vs flat subscription).

ALTER TABLE "cost_events"
  ADD COLUMN "billingType" TEXT NOT NULL DEFAULT 'api';
