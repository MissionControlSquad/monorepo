-- CreateTable
CREATE TABLE "adapter_sessions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "adapterKey" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "sessionParams" JSONB NOT NULL,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "compactedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adapter_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "adapter_sessions_workspaceId_agentId_adapterKey_active_idx" ON "adapter_sessions"("workspaceId", "agentId", "adapterKey", "active");
