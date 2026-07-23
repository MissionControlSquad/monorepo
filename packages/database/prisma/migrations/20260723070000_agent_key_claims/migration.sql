-- CreateTable
CREATE TABLE "agent_key_claims" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT,
    "label" TEXT,
    "claimSecretHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_key_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_key_claims_workspaceId_status_idx" ON "agent_key_claims"("workspaceId", "status");
