-- Epic #14: workspace import audit. 1 table, no new enum (reuses CollisionStrategy from Epic #10).

CREATE TABLE "workspace_imports" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "bundleVersion" INTEGER NOT NULL,
  "collisionStrategy" "CollisionStrategy" NOT NULL DEFAULT 'rename',
  "createdAgentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdProjectIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdSkillIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "summary" JSONB NOT NULL, "importedByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_imports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "workspace_imports_workspaceId_createdAt_idx" ON "workspace_imports"("workspaceId", "createdAt");
