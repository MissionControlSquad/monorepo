-- CreateTable
CREATE TABLE "recurring_tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'inbox',
    "priority" "Priority",
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recurrenceConfig" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "nextDueAt" TIMESTAMP(3),
    "lastGeneratedAt" TIMESTAMP(3),
    "createdByProfileId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_task_assignees" (
    "id" TEXT NOT NULL,
    "recurringTaskId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_task_assignees_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "recurringTaskId" TEXT;

-- CreateIndex
CREATE INDEX "recurring_tasks_isActive_nextDueAt_idx" ON "recurring_tasks"("isActive", "nextDueAt");

-- CreateIndex
CREATE INDEX "recurring_tasks_projectId_idx" ON "recurring_tasks"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_task_assignees_recurringTaskId_profileId_key" ON "recurring_task_assignees"("recurringTaskId", "profileId");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurringTaskId_fkey" FOREIGN KEY ("recurringTaskId") REFERENCES "recurring_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_task_assignees" ADD CONSTRAINT "recurring_task_assignees_recurringTaskId_fkey" FOREIGN KEY ("recurringTaskId") REFERENCES "recurring_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_task_assignees" ADD CONSTRAINT "recurring_task_assignees_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
