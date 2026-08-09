-- Epic #10: skill appearance / provenance metadata (display-only).

ALTER TABLE "skills"
  ADD COLUMN "icon" TEXT,
  ADD COLUMN "color" TEXT,
  ADD COLUMN "tagline" TEXT,
  ADD COLUMN "author" TEXT,
  ADD COLUMN "homepage" TEXT;
