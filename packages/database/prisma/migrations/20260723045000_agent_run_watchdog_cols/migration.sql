-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN "lastOutputAt" TIMESTAMP(3),
    ADD COLUMN "watchdogSnoozedUntil" TIMESTAMP(3);
