-- Prevent double-dispatch: a task may have at most one QUEUED sandbox run at a time. Partial unique so a
-- finished (done/failed/timeout) run never blocks a legitimate re-run/retry of the same task.
CREATE UNIQUE INDEX "agent_runs_task_single_queued"
  ON "agent_runs"("taskId")
  WHERE "status" = 'queued' AND "taskId" IS NOT NULL;
