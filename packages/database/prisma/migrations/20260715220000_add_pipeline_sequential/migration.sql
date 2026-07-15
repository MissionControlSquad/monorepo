-- Sequential-only pipelines: cases must advance one stage at a time (no skipping ahead).
ALTER TABLE "pipelines" ADD COLUMN "sequentialOnly" BOOLEAN NOT NULL DEFAULT false;
