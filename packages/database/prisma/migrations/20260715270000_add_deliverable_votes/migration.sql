-- Tier C: lightweight up/down votes on deliverables (one per member).
CREATE TABLE "deliverable_votes" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "deliverable_votes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "deliverable_votes_deliverableId_voterId_key" ON "deliverable_votes"("deliverableId", "voterId");
CREATE INDEX "deliverable_votes_deliverableId_idx" ON "deliverable_votes"("deliverableId");
ALTER TABLE "deliverable_votes" ADD CONSTRAINT "deliverable_votes_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "deliverables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
