-- Epic #15: board concierge chat. 2 tables, 1 enum.

CREATE TYPE "BoardRole" AS ENUM ('user', 'assistant');

CREATE TABLE "board_threads" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'Board Operations',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "board_threads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "board_threads_workspaceId_key" ON "board_threads"("workspaceId");

CREATE TABLE "board_messages" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "role" "BoardRole" NOT NULL,
  "body" TEXT NOT NULL,
  "authorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "board_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "board_messages_threadId_createdAt_idx" ON "board_messages"("threadId", "createdAt");

ALTER TABLE "board_messages" ADD CONSTRAINT "board_messages_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "board_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
