-- Human-approved secret proposals (port of Paperclip #9934). One additive table; no backfill (starts
-- empty). Rows stay inert and separate from the live "secrets" table until an admin approves. No FKs
-- (workspaceId/requestedByAgentId/decidedByProfileId are plain buildbase/domain ids) so a proposal
-- never cascades from live tables.

CREATE TABLE "secret_proposals" (
  "id"                 TEXT NOT NULL,
  "workspaceId"        TEXT NOT NULL,
  "name"               TEXT NOT NULL,
  "description"        TEXT,
  "scope"              TEXT NOT NULL DEFAULT 'workspace',
  "requestedByAgentId" TEXT,
  "placeholderValue"   TEXT,
  "status"             TEXT NOT NULL DEFAULT 'pending',
  "decisionReason"     TEXT,
  "decidedByProfileId" TEXT,
  "createdSecretId"    TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  "decidedAt"          TIMESTAMP(3),
  CONSTRAINT "secret_proposals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "secret_proposals_workspaceId_idx" ON "secret_proposals"("workspaceId");
CREATE INDEX "secret_proposals_workspaceId_status_idx" ON "secret_proposals"("workspaceId", "status");
