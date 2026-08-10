-- Parity §3.12: WorkMode on Task — how an agent should approach a task.
-- Additive + non-gated core-model field. New enum + NOT NULL column with a safe default so every
-- existing row backfills to 'standard' automatically (no data migration needed).
CREATE TYPE "WorkMode" AS ENUM ('standard', 'ask', 'planning', 'skill_test');

ALTER TABLE "tasks"
  ADD COLUMN "workMode" "WorkMode" NOT NULL DEFAULT 'standard';
