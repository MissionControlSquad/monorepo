-- CreateTable
CREATE TABLE "run_scratch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_scratch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_skill_selections" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "skillSlug" TEXT,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_skill_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_handoff_states" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "agentId" TEXT,
    "taskId" TEXT,
    "outcome" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "nextSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "artifactRefs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_handoff_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "run_scratch_runId_key_key" ON "run_scratch"("runId", "key");
CREATE INDEX "run_scratch_workspaceId_runId_idx" ON "run_scratch"("workspaceId", "runId");
CREATE UNIQUE INDEX "run_skill_selections_runId_skillId_key" ON "run_skill_selections"("runId", "skillId");
CREATE INDEX "run_skill_selections_workspaceId_runId_idx" ON "run_skill_selections"("workspaceId", "runId");
CREATE UNIQUE INDEX "run_handoff_states_runId_key" ON "run_handoff_states"("runId");
CREATE INDEX "run_handoff_states_workspaceId_taskId_idx" ON "run_handoff_states"("workspaceId", "taskId");
