-- Tier C: external object links (GitHub/GitLab/URL) attached to a task.
CREATE TYPE "ExternalLinkKind" AS ENUM ('github', 'gitlab', 'url');

CREATE TABLE "external_links" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" "ExternalLinkKind" NOT NULL DEFAULT 'url',
    "url" TEXT NOT NULL,
    "title" TEXT,
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "external_links_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "external_links_taskId_idx" ON "external_links"("taskId");
ALTER TABLE "external_links" ADD CONSTRAINT "external_links_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
