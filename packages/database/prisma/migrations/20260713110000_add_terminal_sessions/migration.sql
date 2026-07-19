-- Epic #9: terminal sessions. 1 table, 2 enums.

CREATE TYPE "TerminalConnectionType" AS ENUM ('ssh');
CREATE TYPE "TerminalSessionStatus" AS ENUM ('pending', 'active', 'closed', 'expired');

CREATE TABLE "terminal_sessions" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "agentId" TEXT,
  "label" TEXT,
  "connectionType" "TerminalConnectionType" NOT NULL DEFAULT 'ssh',
  "status" "TerminalSessionStatus" NOT NULL DEFAULT 'pending',
  "username" TEXT,
  "host" TEXT,
  "port" INTEGER,
  "cwd" TEXT,
  "connectTokenHash" TEXT NOT NULL,
  "connectExpiresAt" TIMESTAMP(3) NOT NULL,
  "sessionExpiresAt" TIMESTAMP(3) NOT NULL,
  "lastActivityAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "terminal_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "terminal_sessions_workspaceId_status_idx" ON "terminal_sessions"("workspaceId", "status");

ALTER TABLE "terminal_sessions" ADD CONSTRAINT "terminal_sessions_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
