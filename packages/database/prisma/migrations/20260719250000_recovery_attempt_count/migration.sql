-- Domain 9 #8: recovery ladder bound on stranded-work reconciliation.
ALTER TABLE "task_recovery_actions" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 1;
