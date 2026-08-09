-- Tier C: typed task dependency graph.
CREATE TYPE "TaskRelationType" AS ENUM ('blocks', 'relates_to', 'duplicates');

CREATE TABLE "task_relations" (
    "id" TEXT NOT NULL,
    "sourceTaskId" TEXT NOT NULL,
    "targetTaskId" TEXT NOT NULL,
    "type" "TaskRelationType" NOT NULL DEFAULT 'relates_to',
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_relations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_relations_sourceTaskId_targetTaskId_type_key" ON "task_relations"("sourceTaskId", "targetTaskId", "type");
CREATE INDEX "task_relations_sourceTaskId_idx" ON "task_relations"("sourceTaskId");
CREATE INDEX "task_relations_targetTaskId_idx" ON "task_relations"("targetTaskId");

ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_targetTaskId_fkey" FOREIGN KEY ("targetTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
