-- CreateTable
CREATE TABLE "skill_comments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "parentCommentId" TEXT,
    "authorAgentId" TEXT,
    "authorProfileId" TEXT,
    "body" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skill_comments_workspaceId_skillId_createdAt_idx" ON "skill_comments"("workspaceId", "skillId", "createdAt");
CREATE INDEX "skill_comments_parentCommentId_idx" ON "skill_comments"("parentCommentId");
