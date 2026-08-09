-- CreateTable
CREATE TABLE "productivity_reviews" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signals" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "productivity_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "productivity_reviews_workspaceId_agentId_createdAt_idx" ON "productivity_reviews"("workspaceId", "agentId", "createdAt");
