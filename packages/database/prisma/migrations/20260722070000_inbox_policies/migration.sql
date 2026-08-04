-- CreateTable
CREATE TABLE "inbox_policies" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT,
    "itemKind" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbox_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbox_policies_workspaceId_itemKind_enabled_idx" ON "inbox_policies"("workspaceId", "itemKind", "enabled");

-- CreateIndex
CREATE INDEX "inbox_policies_workspaceId_agentId_idx" ON "inbox_policies"("workspaceId", "agentId");
