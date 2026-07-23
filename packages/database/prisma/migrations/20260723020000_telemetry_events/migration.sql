-- CreateTable
CREATE TABLE "telemetry_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "props" JSONB,
    "actorId" TEXT,
    "retentionClass" TEXT NOT NULL DEFAULT 'operational',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telemetry_events_workspaceId_name_createdAt_idx" ON "telemetry_events"("workspaceId", "name", "createdAt");
CREATE INDEX "telemetry_events_retentionClass_createdAt_idx" ON "telemetry_events"("retentionClass", "createdAt");
