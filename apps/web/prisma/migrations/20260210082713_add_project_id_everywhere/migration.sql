-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "agent_actions" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "agent_queue_items" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "deliverables" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "work_sessions" ADD COLUMN     "projectId" TEXT;

-- CreateIndex
CREATE INDEX "activities_projectId_idx" ON "activities"("projectId");

-- CreateIndex
CREATE INDEX "agent_actions_projectId_idx" ON "agent_actions"("projectId");

-- CreateIndex
CREATE INDEX "agent_queue_items_projectId_idx" ON "agent_queue_items"("projectId");

-- CreateIndex
CREATE INDEX "deliverables_projectId_idx" ON "deliverables"("projectId");

-- CreateIndex
CREATE INDEX "documents_projectId_idx" ON "documents"("projectId");

-- CreateIndex
CREATE INDEX "messages_projectId_idx" ON "messages"("projectId");

-- CreateIndex
CREATE INDEX "work_sessions_projectId_idx" ON "work_sessions"("projectId");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_queue_items" ADD CONSTRAINT "agent_queue_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
