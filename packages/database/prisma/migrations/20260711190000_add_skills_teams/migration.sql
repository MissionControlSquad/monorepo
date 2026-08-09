-- Epic #10: skills library + teams catalog. 7 tables, 6 enums, no backfill. workspaceId-scoped.

CREATE TYPE "SkillSourceType" AS ENUM ('local_path', 'github', 'url', 'catalog');
CREATE TYPE "SkillTrustLevel" AS ENUM ('markdown_only', 'assets', 'scripts_executables');
CREATE TYPE "SkillSharingScope" AS ENUM ('private', 'workspace', 'public');
CREATE TYPE "TeamKind" AS ENUM ('bundled', 'optional');
CREATE TYPE "TeamTrustLevel" AS ENUM ('markdown_only', 'assets', 'scripts_executables', 'external_sources');
CREATE TYPE "CollisionStrategy" AS ENUM ('rename', 'skip', 'replace');

CREATE TABLE "skills" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "key" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL, "description" TEXT, "markdown" TEXT NOT NULL,
  "sourceType" "SkillSourceType" NOT NULL DEFAULT 'local_path', "sourceRef" TEXT,
  "trustLevel" "SkillTrustLevel" NOT NULL DEFAULT 'markdown_only',
  "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sharingScope" "SkillSharingScope" NOT NULL DEFAULT 'workspace', "forkedFromSkillId" TEXT,
  "starCount" INTEGER NOT NULL DEFAULT 0, "installCount" INTEGER NOT NULL DEFAULT 0,
  "forkCount" INTEGER NOT NULL DEFAULT 0, "currentVersion" INTEGER NOT NULL DEFAULT 1,
  "createdByProfileId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "skills_workspaceId_key_key" ON "skills"("workspaceId", "key");
CREATE INDEX "skills_workspaceId_idx" ON "skills"("workspaceId");
CREATE INDEX "skills_workspaceId_sharingScope_idx" ON "skills"("workspaceId", "sharingScope");

CREATE TABLE "skill_versions" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "skillId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL, "label" TEXT, "content" TEXT NOT NULL, "createdByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "skill_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "skill_versions_skillId_revisionNumber_key" ON "skill_versions"("skillId", "revisionNumber");
CREATE INDEX "skill_versions_skillId_createdAt_idx" ON "skill_versions"("skillId", "createdAt");

CREATE TABLE "skill_stars" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "skillId" TEXT NOT NULL, "profileId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "skill_stars_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "skill_stars_skillId_profileId_key" ON "skill_stars"("skillId", "profileId");
CREATE INDEX "skill_stars_skillId_idx" ON "skill_stars"("skillId");

CREATE TABLE "agent_skills" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "agentId" TEXT NOT NULL, "skillId" TEXT NOT NULL,
  "pinnedVersion" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_skills_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_skills_agentId_skillId_key" ON "agent_skills"("agentId", "skillId");
CREATE INDEX "agent_skills_skillId_idx" ON "agent_skills"("skillId");
CREATE INDEX "agent_skills_workspaceId_idx" ON "agent_skills"("workspaceId");

CREATE TABLE "teams" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL,
  "description" TEXT, "kind" "TeamKind" NOT NULL DEFAULT 'optional',
  "trustLevel" "TeamTrustLevel" NOT NULL DEFAULT 'markdown_only', "sourceRef" TEXT,
  "installCount" INTEGER NOT NULL DEFAULT 0, "createdByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "teams_workspaceId_key_key" ON "teams"("workspaceId", "key");
CREATE INDEX "teams_workspaceId_idx" ON "teams"("workspaceId");

CREATE TABLE "team_members" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "teamId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "role" TEXT NOT NULL, "templateId" TEXT, "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "config" JSONB, "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "team_members_teamId_idx" ON "team_members"("teamId");

CREATE TABLE "team_installs" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "teamId" TEXT NOT NULL,
  "collisionStrategy" "CollisionStrategy" NOT NULL DEFAULT 'rename',
  "createdAgentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "installedByProfileId" TEXT,
  "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_installs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "team_installs_teamId_idx" ON "team_installs"("teamId");
CREATE INDEX "team_installs_workspaceId_idx" ON "team_installs"("workspaceId");

ALTER TABLE "skills" ADD CONSTRAINT "skills_forkedFromSkillId_fkey" FOREIGN KEY ("forkedFromSkillId") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "skills" ADD CONSTRAINT "skills_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_stars" ADD CONSTRAINT "skill_stars_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_installs" ADD CONSTRAINT "team_installs_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
