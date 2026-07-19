-- Epic #12: CLI device-authorization challenge flow. 1 table.

CREATE TABLE "cli_auth_challenges" (
  "id" TEXT NOT NULL,
  "deviceCode" TEXT NOT NULL,
  "userCode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "keyName" TEXT NOT NULL DEFAULT 'CLI',
  "workspaceId" TEXT,
  "approvedByProfileId" TEXT,
  "apiKeyId" TEXT,
  "plainKey" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cli_auth_challenges_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cli_auth_challenges_deviceCode_key" ON "cli_auth_challenges"("deviceCode");
CREATE UNIQUE INDEX "cli_auth_challenges_userCode_key" ON "cli_auth_challenges"("userCode");
CREATE INDEX "cli_auth_challenges_userCode_idx" ON "cli_auth_challenges"("userCode");
