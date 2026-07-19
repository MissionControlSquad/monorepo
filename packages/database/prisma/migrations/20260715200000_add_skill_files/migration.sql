-- Multi-file skill bundles: supporting files (path -> content) attached to a skill.
CREATE TABLE "skill_files" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "skill_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "skill_files_skillId_path_key" ON "skill_files"("skillId", "path");
CREATE INDEX "skill_files_skillId_idx" ON "skill_files"("skillId");

ALTER TABLE "skill_files" ADD CONSTRAINT "skill_files_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
