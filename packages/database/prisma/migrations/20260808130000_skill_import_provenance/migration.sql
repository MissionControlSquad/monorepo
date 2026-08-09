-- Import provenance for skills (Domain 5 real-import resolvers). Two additive nullable columns; no
-- backfill (existing rows stay null, meaning "authored locally"). packageName names the origin
-- package/repo, originHash is the content hash of the imported bundle. sourceRef already exists.

ALTER TABLE "skills" ADD COLUMN "packageName" TEXT,
    ADD COLUMN "originHash" TEXT;
