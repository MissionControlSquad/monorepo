-- CreateTable
CREATE TABLE "tool_invocations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT,
    "runId" TEXT,
    "toolName" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "errorKind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_invocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tool_invocations_workspaceId_toolName_createdAt_idx" ON "tool_invocations"("workspaceId", "toolName", "createdAt");

-- CreateIndex
CREATE INDEX "tool_invocations_workspaceId_createdAt_idx" ON "tool_invocations"("workspaceId", "createdAt");
