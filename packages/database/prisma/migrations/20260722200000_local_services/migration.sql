-- CreateTable
CREATE TABLE "local_services" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'local_stdio',
    "status" TEXT NOT NULL DEFAULT 'stopped',
    "command" TEXT,
    "pid" INTEGER,
    "restartCount" INTEGER NOT NULL DEFAULT 0,
    "restartHistory" JSONB,
    "lastHealthyAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "local_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "local_services_workspaceId_key_key" ON "local_services"("workspaceId", "key");
CREATE INDEX "local_services_workspaceId_status_idx" ON "local_services"("workspaceId", "status");
