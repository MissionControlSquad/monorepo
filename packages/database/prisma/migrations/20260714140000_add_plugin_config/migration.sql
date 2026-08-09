-- Epic #6: plugin per-workspace config + error surface.

ALTER TABLE "plugins"
  ADD COLUMN "config" JSONB,
  ADD COLUMN "lastError" TEXT;
