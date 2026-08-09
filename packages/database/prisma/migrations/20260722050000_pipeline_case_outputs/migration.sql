-- Structured per-stage pipeline case outputs (parity #98).
CREATE TABLE "pipeline_case_outputs" (
  "id" TEXT NOT NULL, "caseId" TEXT NOT NULL, "stageId" TEXT, "key" TEXT NOT NULL,
  "value" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pipeline_case_outputs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pipeline_case_outputs_caseId_stageId_idx" ON "pipeline_case_outputs"("caseId", "stageId");
ALTER TABLE "pipeline_case_outputs" ADD CONSTRAINT "pipeline_case_outputs_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "pipeline_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
