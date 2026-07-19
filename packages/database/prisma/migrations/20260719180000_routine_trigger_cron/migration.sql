-- Domain 9 #12: cron scheduling for routine triggers. Additive columns.
ALTER TABLE "routine_triggers" ADD COLUMN "cronExpression" TEXT;
ALTER TABLE "routine_triggers" ADD COLUMN "timezone" TEXT;
