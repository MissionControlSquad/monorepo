-- Tier C: review annotations on deliverables.
CREATE TABLE "deliverable_annotations" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "quote" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "deliverable_annotations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "deliverable_annotations_deliverableId_createdAt_idx" ON "deliverable_annotations"("deliverableId", "createdAt");
ALTER TABLE "deliverable_annotations" ADD CONSTRAINT "deliverable_annotations_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "deliverables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
