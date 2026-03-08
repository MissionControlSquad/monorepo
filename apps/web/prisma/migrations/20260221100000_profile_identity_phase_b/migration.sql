-- Phase B: Migrate TaskAssignee, Task, Deliverable, DeliverableVersion, ProjectMember, Activity
-- from agent-based identity to profile-based identity.

-- ═══ TaskAssignee ═══════════════════════════════════════════════════════
ALTER TABLE "task_assignees" ADD COLUMN "profileId" TEXT;

UPDATE "task_assignees" ta
SET "profileId" = p.id
FROM "profiles" p
WHERE p."agentId" = ta."agentId";

-- Drop old unique, FK, index
ALTER TABLE "task_assignees" DROP CONSTRAINT IF EXISTS "task_assignees_taskId_agentId_key";
ALTER TABLE "task_assignees" DROP CONSTRAINT IF EXISTS "task_assignees_agentId_fkey";
DROP INDEX IF EXISTS "task_assignees_agentId_idx";
ALTER TABLE "task_assignees" DROP COLUMN "agentId";

-- Make NOT NULL after backfill
ALTER TABLE "task_assignees" ALTER COLUMN "profileId" SET NOT NULL;

-- Add new FK, unique, index
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_taskId_profileId_key" UNIQUE ("taskId", "profileId");
CREATE INDEX "task_assignees_profileId_idx" ON "task_assignees"("profileId");

-- ═══ Task (createdById -> createdByProfileId) ═══════════════════════════
ALTER TABLE "tasks" ADD COLUMN "createdByProfileId" TEXT;

UPDATE "tasks" t
SET "createdByProfileId" = p.id
FROM "profiles" p
WHERE p."agentId" = t."createdById";

-- Drop old FK
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_createdById_fkey";
ALTER TABLE "tasks" DROP COLUMN "createdById";

-- Add new FK
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══ Deliverable (agentId -> profileId) ══════════════════════════════════
ALTER TABLE "deliverables" ADD COLUMN "profileId" TEXT;

UPDATE "deliverables" d
SET "profileId" = p.id
FROM "profiles" p
WHERE p."agentId" = d."agentId";

-- Drop old FK, indexes
ALTER TABLE "deliverables" DROP CONSTRAINT IF EXISTS "deliverables_agentId_fkey";
DROP INDEX IF EXISTS "deliverables_agentId_idx";
DROP INDEX IF EXISTS "deliverables_taskId_agentId_idx";
ALTER TABLE "deliverables" DROP COLUMN "agentId";

ALTER TABLE "deliverables" ALTER COLUMN "profileId" SET NOT NULL;

-- Add new FK, indexes
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "deliverables_profileId_idx" ON "deliverables"("profileId");
CREATE INDEX "deliverables_taskId_profileId_idx" ON "deliverables"("taskId", "profileId");

-- ═══ DeliverableVersion (editedById -> editedByProfileId) ════════════════
ALTER TABLE "deliverable_versions" ADD COLUMN "editedByProfileId" TEXT;

UPDATE "deliverable_versions" dv
SET "editedByProfileId" = p.id
FROM "profiles" p
WHERE p."agentId" = dv."editedById";

-- Drop old FK
ALTER TABLE "deliverable_versions" DROP CONSTRAINT IF EXISTS "deliverable_versions_editedById_fkey";
ALTER TABLE "deliverable_versions" DROP COLUMN "editedById";

-- Add new FK
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_editedByProfileId_fkey" FOREIGN KEY ("editedByProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══ ProjectMember (agentId -> profileId) ════════════════════════════════
ALTER TABLE "project_members" ADD COLUMN "profileId" TEXT;

UPDATE "project_members" pm
SET "profileId" = p.id
FROM "profiles" p
WHERE p."agentId" = pm."agentId";

-- Drop old unique, FK, index
ALTER TABLE "project_members" DROP CONSTRAINT IF EXISTS "project_members_projectId_agentId_key";
ALTER TABLE "project_members" DROP CONSTRAINT IF EXISTS "project_members_agentId_fkey";
DROP INDEX IF EXISTS "project_members_agentId_idx";
ALTER TABLE "project_members" DROP COLUMN "agentId";

ALTER TABLE "project_members" ALTER COLUMN "profileId" SET NOT NULL;

-- Add new FK, unique, index
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_profileId_key" UNIQUE ("projectId", "profileId");
CREATE INDEX "project_members_profileId_idx" ON "project_members"("profileId");

-- ═══ Activity (agentId -> profileId) ═════════════════════════════════════
ALTER TABLE "activities" ADD COLUMN "profileId" TEXT;

UPDATE "activities" a
SET "profileId" = p.id
FROM "profiles" p
WHERE p."agentId" = a."agentId";

-- Drop old FK, index
ALTER TABLE "activities" DROP CONSTRAINT IF EXISTS "activities_agentId_fkey";
DROP INDEX IF EXISTS "activities_agentId_idx";
ALTER TABLE "activities" DROP COLUMN "agentId";

-- Add new FK, index (nullable)
ALTER TABLE "activities" ADD CONSTRAINT "activities_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "activities_profileId_idx" ON "activities"("profileId");
