-- CreateEnum
CREATE TYPE "SetupStatus" AS ENUM ('pending_setup', 'active', 'deactivated');

-- CreateEnum
CREATE TYPE "ProjectMemberStatus" AS ENUM ('active', 'deactivated');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_reactions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverable_versions" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "DeliverableKind" NOT NULL,
    "content" TEXT,
    "language" TEXT,
    "storageKey" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "url" TEXT,
    "editedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliverable_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");

-- CreateIndex
CREATE INDEX "message_reactions_messageId_idx" ON "message_reactions"("messageId");

-- CreateIndex
CREATE INDEX "message_reactions_agentId_idx" ON "message_reactions"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "message_reactions_messageId_agentId_emoji_key" ON "message_reactions"("messageId", "agentId", "emoji");

-- CreateIndex
CREATE INDEX "deliverable_versions_deliverableId_idx" ON "deliverable_versions"("deliverableId");

-- CreateIndex
CREATE INDEX "deliverable_versions_deliverableId_version_idx" ON "deliverable_versions"("deliverableId", "version");

-- AlterTable: agents - add new columns
ALTER TABLE "agents" ADD COLUMN "setupStatus" "SetupStatus" NOT NULL DEFAULT 'active';
ALTER TABLE "agents" ADD COLUMN "apiKeyHash" TEXT;
ALTER TABLE "agents" ADD COLUMN "apiKeyPrefix" TEXT;
ALTER TABLE "agents" ADD COLUMN "apiKeyCreatedAt" TIMESTAMP(3);
ALTER TABLE "agents" ADD COLUMN "templateId" TEXT;
ALTER TABLE "agents" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "agents" ALTER COLUMN "sessionKey" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "agents_apiKeyHash_key" ON "agents"("apiKeyHash");

-- AlterTable: tasks - add blockedByTaskId
ALTER TABLE "tasks" ADD COLUMN "blockedByTaskId" TEXT;

-- CreateIndex
CREATE INDEX "tasks_blockedByTaskId_idx" ON "tasks"("blockedByTaskId");

-- AlterTable: deliverables - add version and updatedAt
ALTER TABLE "deliverables" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "deliverables" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: project_members - add status
ALTER TABLE "project_members" ADD COLUMN "status" "ProjectMemberStatus" NOT NULL DEFAULT 'active';

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_blockedByTaskId_fkey" FOREIGN KEY ("blockedByTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "deliverables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
