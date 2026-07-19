-- Epic #7: Routines (scheduled/triggered workflow docs + run history + revisions) and Pipelines
-- (multi-stage case workflows). 8 tables + 4 enums; no backfill. workspaceId-scoped (no FK, D5).

CREATE TYPE "RoutineTriggerType" AS ENUM ('cron', 'manual', 'webhook');
CREATE TYPE "RoutineRunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');
CREATE TYPE "CaseStatus" AS ENUM ('open', 'claimed', 'in_review', 'transitioned', 'done', 'rejected');
CREATE TYPE "PipelineCaseEventType" AS ENUM ('created', 'claimed', 'transitioned', 'commented', 'breakdown', 'rejected', 'linked_task');

CREATE TABLE "routines" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "definition" JSONB NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true, "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "currentVersion" INTEGER NOT NULL DEFAULT 1, "createdByProfileId" TEXT, "projectId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "routines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "routines_workspaceId_idx" ON "routines"("workspaceId");
CREATE INDEX "routines_workspaceId_isActive_idx" ON "routines"("workspaceId", "isActive");
CREATE INDEX "routines_projectId_idx" ON "routines"("projectId");

CREATE TABLE "routine_triggers" (
  "id" TEXT NOT NULL, "routineId" TEXT NOT NULL, "type" "RoutineTriggerType" NOT NULL,
  "recurrenceConfig" JSONB, "nextFireAt" TIMESTAMP(3), "publicId" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "routine_triggers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "routine_triggers_publicId_key" ON "routine_triggers"("publicId");
CREATE INDEX "routine_triggers_routineId_idx" ON "routine_triggers"("routineId");
CREATE INDEX "routine_triggers_type_isEnabled_nextFireAt_idx" ON "routine_triggers"("type", "isEnabled", "nextFireAt");
CREATE INDEX "routine_triggers_publicId_idx" ON "routine_triggers"("publicId");

CREATE TABLE "routine_revisions" (
  "id" TEXT NOT NULL, "routineId" TEXT NOT NULL, "version" INTEGER NOT NULL, "definition" JSONB NOT NULL,
  "editedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "routine_revisions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "routine_revisions_routineId_version_key" ON "routine_revisions"("routineId", "version");
CREATE INDEX "routine_revisions_routineId_createdAt_idx" ON "routine_revisions"("routineId", "createdAt");

CREATE TABLE "routine_runs" (
  "id" TEXT NOT NULL, "routineId" TEXT NOT NULL, "triggeredBy" "RoutineTriggerType" NOT NULL,
  "triggerId" TEXT, "status" "RoutineRunStatus" NOT NULL DEFAULT 'queued', "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3), "error" TEXT, "output" JSONB, "generatedTaskId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "routine_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "routine_runs_routineId_createdAt_idx" ON "routine_runs"("routineId", "createdAt");
CREATE INDEX "routine_runs_status_idx" ON "routine_runs"("status");

CREATE TABLE "pipelines" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "projectId" TEXT, "name" TEXT NOT NULL,
  "description" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pipelines_workspaceId_idx" ON "pipelines"("workspaceId");
CREATE INDEX "pipelines_projectId_idx" ON "pipelines"("projectId");

CREATE TABLE "pipeline_stages" (
  "id" TEXT NOT NULL, "pipelineId" TEXT NOT NULL, "name" TEXT NOT NULL, "order" INTEGER NOT NULL,
  "isReviewStage" BOOLEAN NOT NULL DEFAULT false, "slaMinutes" INTEGER,
  CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pipeline_stages_pipelineId_order_key" ON "pipeline_stages"("pipelineId", "order");
CREATE INDEX "pipeline_stages_pipelineId_idx" ON "pipeline_stages"("pipelineId");

CREATE TABLE "pipeline_cases" (
  "id" TEXT NOT NULL, "pipelineId" TEXT NOT NULL, "currentStageId" TEXT, "title" TEXT NOT NULL,
  "payload" JSONB, "status" "CaseStatus" NOT NULL DEFAULT 'open', "claimedByProfileId" TEXT,
  "claimedAt" TIMESTAMP(3), "linkedTaskId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "enteredStageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pipeline_cases_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pipeline_cases_pipelineId_status_idx" ON "pipeline_cases"("pipelineId", "status");
CREATE INDEX "pipeline_cases_currentStageId_status_idx" ON "pipeline_cases"("currentStageId", "status");
CREATE INDEX "pipeline_cases_claimedByProfileId_idx" ON "pipeline_cases"("claimedByProfileId");
CREATE INDEX "pipeline_cases_enteredStageAt_idx" ON "pipeline_cases"("enteredStageAt");

CREATE TABLE "pipeline_case_events" (
  "id" TEXT NOT NULL, "caseId" TEXT NOT NULL, "type" "PipelineCaseEventType" NOT NULL,
  "fromStageId" TEXT, "toStageId" TEXT, "actorProfileId" TEXT, "note" TEXT, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pipeline_case_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pipeline_case_events_caseId_createdAt_idx" ON "pipeline_case_events"("caseId", "createdAt");

ALTER TABLE "routines" ADD CONSTRAINT "routines_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "routines" ADD CONSTRAINT "routines_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "routine_triggers" ADD CONSTRAINT "routine_triggers_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "routine_revisions" ADD CONSTRAINT "routine_revisions_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "routine_revisions" ADD CONSTRAINT "routine_revisions_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "routine_runs" ADD CONSTRAINT "routine_runs_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "routine_runs" ADD CONSTRAINT "routine_runs_generatedTaskId_fkey" FOREIGN KEY ("generatedTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pipeline_cases" ADD CONSTRAINT "pipeline_cases_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pipeline_cases" ADD CONSTRAINT "pipeline_cases_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pipeline_cases" ADD CONSTRAINT "pipeline_cases_claimedByProfileId_fkey" FOREIGN KEY ("claimedByProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pipeline_cases" ADD CONSTRAINT "pipeline_cases_linkedTaskId_fkey" FOREIGN KEY ("linkedTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pipeline_case_events" ADD CONSTRAINT "pipeline_case_events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "pipeline_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
