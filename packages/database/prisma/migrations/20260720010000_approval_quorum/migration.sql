-- Domain 14 #14: N-of-M board quorum on approvals.
ALTER TABLE "approvals" ADD COLUMN "requiredApprovals" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "approval_votes" (
  "id" TEXT NOT NULL,
  "approvalId" TEXT NOT NULL,
  "voterProfileId" TEXT NOT NULL,
  "vote" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_votes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "approval_votes_approvalId_voterProfileId_key" ON "approval_votes"("approvalId", "voterProfileId");
CREATE INDEX "approval_votes_approvalId_idx" ON "approval_votes"("approvalId");
ALTER TABLE "approval_votes" ADD CONSTRAINT "approval_votes_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "approvals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
