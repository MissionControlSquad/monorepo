-- Board principal (Paperclip board-authz + board API keys) + boardroom attribution.
-- Additive-only: a nullable attribution column on board_messages and a new board_principals table.
-- Existing rows are unaffected (boardPrincipalId defaults NULL — a human/assistant turn).

-- AlterTable: attribute a board turn to a principal when one posts it (NULL = operator/assistant).
ALTER TABLE "board_messages" ADD COLUMN "boardPrincipalId" TEXT;

-- CreateIndex
CREATE INDEX "board_messages_boardPrincipalId_idx" ON "board_messages"("boardPrincipalId");

-- CreateTable: a first-class board identity that authenticates with the existing ApiKey scheme
-- (apiKeyId is a loose ref, no FK — D5). Revoke tombstones via revokedAt.
CREATE TABLE "board_principals" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "apiKeyId" TEXT NOT NULL,
    "createdByProfileId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_principals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: list a workspace's (active/revoked) board principals.
CREATE INDEX "board_principals_workspaceId_revokedAt_idx" ON "board_principals"("workspaceId", "revokedAt");
