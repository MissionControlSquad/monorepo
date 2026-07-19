-- Epic #10: team catalog appearance / discovery metadata.

ALTER TABLE "teams"
  ADD COLUMN "icon" TEXT,
  ADD COLUMN "tagline" TEXT,
  ADD COLUMN "author" TEXT,
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';
