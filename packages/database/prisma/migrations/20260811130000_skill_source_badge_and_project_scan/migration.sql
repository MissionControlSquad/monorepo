-- §3 skills residuals: source-badge + catalog provenance columns, and a project-workspace-scan source.
-- PURELY ADDITIVE and reversible-by-drop: every new column is nullable (existing rows adopt NULL and
-- keep behaving identically — badges/provenance are display-only), and the new enum value is only ADDED
-- here, never USED in this migration (Postgres forbids using a freshly-added enum value in the same
-- transaction). No backfill required.

-- AlterEnum: a skill discovered by scanning a project workspace's checked-out files.
ALTER TYPE "SkillSourceType" ADD VALUE 'project_scan';

-- AlterTable: source-badge + catalog-manifest provenance (display-only).
ALTER TABLE "skills"
    ADD COLUMN "catalogKey" TEXT,
    ADD COLUMN "packageVersion" TEXT,
    ADD COLUMN "catalogKind" TEXT,
    ADD COLUMN "sourceBadge" TEXT;
