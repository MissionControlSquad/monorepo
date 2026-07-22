-- CreateTable
CREATE TABLE "provider_auth_states" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountRef" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'unknown',
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_auth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_auth_states_workspaceId_provider_accountRef_key" ON "provider_auth_states"("workspaceId", "provider", "accountRef");
CREATE INDEX "provider_auth_states_workspaceId_state_idx" ON "provider_auth_states"("workspaceId", "state");
