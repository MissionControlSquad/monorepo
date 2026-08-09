-- Tool content-guards (parity #163): deny/redact rules over tool I/O content.
CREATE TABLE "tool_content_guards" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "pattern" TEXT NOT NULL,
  "action" TEXT NOT NULL, "appliesTo" TEXT NOT NULL DEFAULT 'both',
  "priority" INTEGER NOT NULL DEFAULT 0, "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tool_content_guards_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tool_content_guards_workspaceId_idx" ON "tool_content_guards"("workspaceId");
