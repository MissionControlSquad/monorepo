-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('idle', 'active', 'blocked');

-- CreateEnum
CREATE TYPE "DetailedStatus" AS ENUM ('thinking', 'coding', 'reviewing', 'researching', 'deploying', 'testing', 'writing', 'waiting_review', 'waiting_input', 'waiting_dependency');

-- CreateEnum
CREATE TYPE "AgentLevel" AS ENUM ('intern', 'specialist', 'lead');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('inbox', 'assigned', 'in_progress', 'review', 'done', 'blocked');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('task_created', 'task_updated', 'message_sent', 'document_created', 'agent_status_changed', 'task_assigned', 'task_completed', 'agent_woke_up', 'agent_went_to_sleep', 'deliverable_submitted');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('deliverable', 'research', 'protocol', 'note');

-- CreateEnum
CREATE TYPE "WorkSessionEventType" AS ENUM ('started', 'continued', 'paused', 'completed');

-- CreateEnum
CREATE TYPE "AgentActionType" AS ENUM ('file_opened', 'file_edited', 'command_executed', 'code_written', 'research_done', 'comment_posted', 'status_update', 'thinking', 'waiting', 'reviewing', 'deploying', 'testing', 'writing_docs');

-- CreateEnum
CREATE TYPE "DeliverableKind" AS ENUM ('markdown', 'code', 'file', 'link');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "ProjectDocEditAction" AS ENUM ('created', 'updated', 'deleted');

-- CreateEnum
CREATE TYPE "QueueItemStatus" AS ENUM ('pending', 'in_progress', 'completed', 'blocked', 'skipped');

-- CreateEnum
CREATE TYPE "QueueItemPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "QueueItemType" AS ENUM ('task_breakdown', 'personal_note', 'reminder', 'follow_up', 'research', 'action');

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'idle',
    "detailedStatus" "DetailedStatus",
    "statusMessage" TEXT,
    "sessionKey" TEXT NOT NULL,
    "currentTaskId" TEXT,
    "currentTask" TEXT,
    "avatar" TEXT,
    "personality" TEXT,
    "workspacePath" TEXT,
    "identityEmoji" TEXT,
    "level" "AgentLevel",
    "username" TEXT,
    "lastHeartbeat" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'inbox',
    "priority" "Priority",
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "taskNumber" SERIAL NOT NULL,
    "parentTaskId" TEXT,
    "projectId" TEXT,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignees" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromAgentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_mentions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,

    CONSTRAINT "message_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "agentId" TEXT,
    "taskId" TEXT,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "taskId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "mentionedAgentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "taskId" TEXT,
    "messageId" TEXT,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_sessions" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "eventType" "WorkSessionEventType" NOT NULL,

    CONSTRAINT "work_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_history" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "fromStatus" "AgentStatus" NOT NULL,
    "toStatus" "AgentStatus" NOT NULL,
    "fromDetailedStatus" "DetailedStatus",
    "toDetailedStatus" "DetailedStatus",
    "statusMessage" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_actions" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "taskId" TEXT,
    "actionType" "AgentActionType" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverables" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "DeliverableKind" NOT NULL,
    "content" TEXT,
    "language" TEXT,
    "storageKey" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subtasks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_docs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_docs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_doc_revisions" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT NOT NULL,
    "editedById" TEXT,
    "editAction" "ProjectDocEditAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_doc_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_queue_items" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "status" "QueueItemStatus" NOT NULL DEFAULT 'pending',
    "priority" "QueueItemPriority" NOT NULL DEFAULT 'medium',
    "relatedTaskId" TEXT,
    "parentQueueItemId" TEXT,
    "itemType" "QueueItemType" NOT NULL DEFAULT 'action',
    "autoGenerated" BOOLEAN NOT NULL DEFAULT false,
    "generatedFrom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "agent_queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agents_sessionKey_key" ON "agents"("sessionKey");

-- CreateIndex
CREATE UNIQUE INDEX "agents_username_key" ON "agents"("username");

-- CreateIndex
CREATE INDEX "agents_username_idx" ON "agents"("username");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_createdAt_idx" ON "tasks"("createdAt");

-- CreateIndex
CREATE INDEX "tasks_parentTaskId_idx" ON "tasks"("parentTaskId");

-- CreateIndex
CREATE INDEX "tasks_projectId_idx" ON "tasks"("projectId");

-- CreateIndex
CREATE INDEX "tasks_projectId_status_idx" ON "tasks"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_taskNumber_key" ON "tasks"("taskNumber");

-- CreateIndex
CREATE INDEX "task_assignees_agentId_idx" ON "task_assignees"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignees_taskId_agentId_key" ON "task_assignees"("taskId", "agentId");

-- CreateIndex
CREATE INDEX "messages_taskId_idx" ON "messages"("taskId");

-- CreateIndex
CREATE INDEX "messages_fromAgentId_idx" ON "messages"("fromAgentId");

-- CreateIndex
CREATE INDEX "messages_createdAt_idx" ON "messages"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "message_attachments_messageId_documentId_key" ON "message_attachments"("messageId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "message_mentions_messageId_agentId_key" ON "message_mentions"("messageId", "agentId");

-- CreateIndex
CREATE INDEX "activities_createdAt_idx" ON "activities"("createdAt");

-- CreateIndex
CREATE INDEX "activities_agentId_idx" ON "activities"("agentId");

-- CreateIndex
CREATE INDEX "activities_taskId_idx" ON "activities"("taskId");

-- CreateIndex
CREATE INDEX "documents_taskId_idx" ON "documents"("taskId");

-- CreateIndex
CREATE INDEX "documents_type_idx" ON "documents"("type");

-- CreateIndex
CREATE INDEX "documents_createdAt_idx" ON "documents"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_mentionedAgentId_idx" ON "notifications"("mentionedAgentId");

-- CreateIndex
CREATE INDEX "notifications_delivered_idx" ON "notifications"("delivered");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "subscriptions_agentId_idx" ON "subscriptions"("agentId");

-- CreateIndex
CREATE INDEX "subscriptions_taskId_idx" ON "subscriptions"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_agentId_taskId_key" ON "subscriptions"("agentId", "taskId");

-- CreateIndex
CREATE INDEX "work_sessions_taskId_idx" ON "work_sessions"("taskId");

-- CreateIndex
CREATE INDEX "work_sessions_agentId_idx" ON "work_sessions"("agentId");

-- CreateIndex
CREATE INDEX "work_sessions_taskId_agentId_idx" ON "work_sessions"("taskId", "agentId");

-- CreateIndex
CREATE INDEX "work_sessions_startedAt_idx" ON "work_sessions"("startedAt");

-- CreateIndex
CREATE INDEX "status_history_agentId_idx" ON "status_history"("agentId");

-- CreateIndex
CREATE INDEX "status_history_agentId_timestamp_idx" ON "status_history"("agentId", "timestamp");

-- CreateIndex
CREATE INDEX "status_history_timestamp_idx" ON "status_history"("timestamp");

-- CreateIndex
CREATE INDEX "agent_actions_agentId_idx" ON "agent_actions"("agentId");

-- CreateIndex
CREATE INDEX "agent_actions_taskId_idx" ON "agent_actions"("taskId");

-- CreateIndex
CREATE INDEX "agent_actions_timestamp_idx" ON "agent_actions"("timestamp");

-- CreateIndex
CREATE INDEX "agent_actions_agentId_timestamp_idx" ON "agent_actions"("agentId", "timestamp");

-- CreateIndex
CREATE INDEX "deliverables_taskId_idx" ON "deliverables"("taskId");

-- CreateIndex
CREATE INDEX "deliverables_agentId_idx" ON "deliverables"("agentId");

-- CreateIndex
CREATE INDEX "deliverables_taskId_agentId_idx" ON "deliverables"("taskId", "agentId");

-- CreateIndex
CREATE INDEX "task_templates_createdAt_idx" ON "task_templates"("createdAt");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "projects_createdAt_idx" ON "projects"("createdAt");

-- CreateIndex
CREATE INDEX "project_members_agentId_idx" ON "project_members"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_projectId_agentId_key" ON "project_members"("projectId", "agentId");

-- CreateIndex
CREATE INDEX "project_docs_projectId_idx" ON "project_docs"("projectId");

-- CreateIndex
CREATE INDEX "project_doc_revisions_docId_idx" ON "project_doc_revisions"("docId");

-- CreateIndex
CREATE INDEX "project_doc_revisions_docId_createdAt_idx" ON "project_doc_revisions"("docId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_queue_items_agentId_idx" ON "agent_queue_items"("agentId");

-- CreateIndex
CREATE INDEX "agent_queue_items_agentId_status_idx" ON "agent_queue_items"("agentId", "status");

-- CreateIndex
CREATE INDEX "agent_queue_items_relatedTaskId_idx" ON "agent_queue_items"("relatedTaskId");

-- CreateIndex
CREATE INDEX "agent_queue_items_agentId_priority_idx" ON "agent_queue_items"("agentId", "priority");

-- CreateIndex
CREATE INDEX "agent_queue_items_createdAt_idx" ON "agent_queue_items"("createdAt");

-- CreateIndex
CREATE INDEX "agent_queue_items_agentId_order_idx" ON "agent_queue_items"("agentId", "order");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_currentTaskId_fkey" FOREIGN KEY ("currentTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_fromAgentId_fkey" FOREIGN KEY ("fromAgentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_mentions" ADD CONSTRAINT "message_mentions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_mentions" ADD CONSTRAINT "message_mentions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_mentionedAgentId_fkey" FOREIGN KEY ("mentionedAgentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_docs" ADD CONSTRAINT "project_docs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_docs" ADD CONSTRAINT "project_docs_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_doc_revisions" ADD CONSTRAINT "project_doc_revisions_docId_fkey" FOREIGN KEY ("docId") REFERENCES "project_docs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_doc_revisions" ADD CONSTRAINT "project_doc_revisions_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_queue_items" ADD CONSTRAINT "agent_queue_items_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_queue_items" ADD CONSTRAINT "agent_queue_items_relatedTaskId_fkey" FOREIGN KEY ("relatedTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_queue_items" ADD CONSTRAINT "agent_queue_items_parentQueueItemId_fkey" FOREIGN KEY ("parentQueueItemId") REFERENCES "agent_queue_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
