-- Personal (member-owned) secrets: owner-only visibility/management, distinct from workspace secrets.
ALTER TABLE "secrets" ADD COLUMN "personal" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "secrets_workspaceId_personal_createdBy_idx" ON "secrets"("workspaceId", "personal", "createdBy");
