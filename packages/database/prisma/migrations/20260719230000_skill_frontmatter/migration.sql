-- Domain 5 GAP-A: skill frontmatter + bundle-file kind classification. Additive.
ALTER TABLE "skills" ADD COLUMN "frontmatter" JSONB;
ALTER TABLE "skill_files" ADD COLUMN "kind" TEXT;
