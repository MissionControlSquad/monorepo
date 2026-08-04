-- CreateTable
CREATE TABLE "smoke_cases" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "agentId" TEXT,
    "inputText" TEXT,
    "expectDecision" TEXT NOT NULL,
    "lastResult" TEXT,
    "lastActual" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smoke_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "smoke_cases_workspaceId_createdAt_idx" ON "smoke_cases"("workspaceId", "createdAt");
