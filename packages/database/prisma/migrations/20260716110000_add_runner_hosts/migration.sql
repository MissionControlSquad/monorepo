-- Tier D: registered BYO servers for direct server-side SSH command execution.
CREATE TABLE "runner_hosts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "username" TEXT NOT NULL DEFAULT 'root',
    "sshPrivateKey" TEXT NOT NULL,
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "runner_hosts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "runner_hosts_workspaceId_idx" ON "runner_hosts"("workspaceId");
