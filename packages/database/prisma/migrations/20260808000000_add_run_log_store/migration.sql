-- Per-run log store: full persisted stdout/stderr transcript (chunks + finalize meta). 2 tables.

CREATE TABLE "run_log_chunks" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "seq" INTEGER NOT NULL,
  "stream" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "byteOffset" INTEGER NOT NULL,
  "byteLength" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "run_log_chunks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "run_log_chunks_runId_seq_key" ON "run_log_chunks"("runId", "seq");
CREATE INDEX "run_log_chunks_workspaceId_runId_idx" ON "run_log_chunks"("workspaceId", "runId");

CREATE TABLE "run_log_meta" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "totalBytes" INTEGER NOT NULL DEFAULT 0,
  "sha256" TEXT NOT NULL,
  "finalizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "run_log_meta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "run_log_meta_runId_key" ON "run_log_meta"("runId");
CREATE INDEX "run_log_meta_workspaceId_runId_idx" ON "run_log_meta"("workspaceId", "runId");
