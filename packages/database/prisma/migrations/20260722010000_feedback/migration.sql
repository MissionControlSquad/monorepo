-- Feedback (parity #60-62): thumbs-up/down + optional (redacted) comment on a target.
CREATE TABLE "feedback" (
  "id"                   TEXT NOT NULL,
  "workspaceId"          TEXT NOT NULL,
  "targetType"           TEXT NOT NULL,
  "targetId"             TEXT,
  "rating"               TEXT NOT NULL,
  "comment"              TEXT,
  "submittedByProfileId" TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "feedback_workspaceId_targetType_createdAt_idx" ON "feedback"("workspaceId", "targetType", "createdAt");
