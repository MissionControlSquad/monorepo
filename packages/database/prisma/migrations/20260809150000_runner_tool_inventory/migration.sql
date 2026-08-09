-- CreateTable: runner_tool_inventories (AI Tools doctor - latest inventory a remote runner reported)
CREATE TABLE "runner_tool_inventories" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runnerId" TEXT NOT NULL,
    "runnerName" TEXT,
    "os" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runner_tool_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "runner_tool_inventories_workspaceId_runnerId_key" ON "runner_tool_inventories"("workspaceId", "runnerId");

-- CreateIndex
CREATE INDEX "runner_tool_inventories_workspaceId_idx" ON "runner_tool_inventories"("workspaceId");
