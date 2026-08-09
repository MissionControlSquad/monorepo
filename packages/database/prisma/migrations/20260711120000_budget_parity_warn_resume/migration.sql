-- Epic #4 Paperclip parity: soft-warn threshold + approval-gated resume.

-- New incident threshold enum.
CREATE TYPE "IncidentThreshold" AS ENUM ('soft', 'hard');

-- Extend approval subjects with the budget-override approval that gates resume.
ALTER TYPE "ApprovalSubjectType" ADD VALUE IF NOT EXISTS 'budget_override';

-- BudgetPolicy: soft-warn threshold + notification toggle.
ALTER TABLE "budget_policies"
  ADD COLUMN "warnPercent" INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN "notifyEnabled" BOOLEAN NOT NULL DEFAULT true;

-- QuotaWindow: track that the soft-warn incident already fired (idempotent per window).
ALTER TABLE "quota_windows"
  ADD COLUMN "warned" BOOLEAN NOT NULL DEFAULT false;

-- BudgetIncident: threshold type + optional link to the override approval.
ALTER TABLE "budget_incidents"
  ADD COLUMN "thresholdType" "IncidentThreshold" NOT NULL DEFAULT 'hard',
  ADD COLUMN "approvalId" TEXT;
