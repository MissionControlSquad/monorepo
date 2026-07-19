-- Domain 5 GAP-F: per-workspace skill governance policy.
CREATE TABLE "skill_policies" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "defaultEffect" TEXT NOT NULL DEFAULT 'allow',
  "rules" JSONB NOT NULL DEFAULT '[]',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "skill_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "skill_policies_workspaceId_key" ON "skill_policies"("workspaceId");
