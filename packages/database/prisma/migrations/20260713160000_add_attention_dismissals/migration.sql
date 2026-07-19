-- Epic #20b: attention feed dismissals. 1 table.

CREATE TABLE "attention_dismissals" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "dismissedByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attention_dismissals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attention_dismissals_workspaceId_itemKey_key" ON "attention_dismissals"("workspaceId", "itemKey");
CREATE INDEX "attention_dismissals_workspaceId_idx" ON "attention_dismissals"("workspaceId");
