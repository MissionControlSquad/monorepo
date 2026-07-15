-- Epic #7: pipeline stage approval gate.

ALTER TABLE "pipeline_stages"
  ADD COLUMN "requireApproval" BOOLEAN NOT NULL DEFAULT false;
