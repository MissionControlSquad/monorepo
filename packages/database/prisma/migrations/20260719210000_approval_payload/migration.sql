-- Domain 14 #3: carry a subject-specific spec on an approval (e.g. hire_agent hire request).
ALTER TABLE "approvals" ADD COLUMN "payload" JSONB;
