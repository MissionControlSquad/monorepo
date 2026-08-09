-- Project source configuration (Paperclip Project Workspace parity). Portable metadata columns.

ALTER TABLE "projects"
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "repoUrl" TEXT,
  ADD COLUMN "repoRef" TEXT,
  ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private';
