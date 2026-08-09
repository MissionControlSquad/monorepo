-- Tier D / Phase 3 (Plan 5): environment custom image templates.
CREATE TABLE "environment_custom_image_templates" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "environmentId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "templateKind" TEXT NOT NULL DEFAULT 'snapshot',
  "templateRef" TEXT NOT NULL,
  "sourceTemplateRef" TEXT,
  "sourceConfigFingerprint" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "supersededByTemplateId" TEXT,
  "createdByProfileId" TEXT,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "environment_custom_image_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "environment_custom_image_templates_workspaceId_environmentId_status_idx" ON "environment_custom_image_templates"("workspaceId", "environmentId", "status");
-- Partial-unique: at most one ACTIVE template per (environmentId, provider).
CREATE UNIQUE INDEX "environment_custom_image_templates_one_active_per_env_provider" ON "environment_custom_image_templates"("environmentId", "provider") WHERE "status" = 'active';
