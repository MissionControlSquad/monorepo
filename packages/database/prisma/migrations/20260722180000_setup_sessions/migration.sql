-- CreateTable
CREATE TABLE "environment_custom_image_setup_sessions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "baseTemplateId" TEXT,
    "terminalSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "resultTemplateId" TEXT,
    "connectionSummary" JSONB,
    "lastError" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "environment_custom_image_setup_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "environment_custom_image_setup_sessions_workspaceId_environ_idx" ON "environment_custom_image_setup_sessions"("workspaceId", "environmentId", "status");
CREATE INDEX "environment_custom_image_setup_sessions_workspaceId_status_e_idx" ON "environment_custom_image_setup_sessions"("workspaceId", "status", "expiresAt");
