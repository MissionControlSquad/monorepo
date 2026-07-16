-- Tier D: runner commands — raw shell/CLI jobs on a runner (server-SSH or agent-daemon pull).
CREATE TYPE "RunnerCommandStatus" AS ENUM ('queued', 'running', 'done', 'failed', 'timeout', 'canceled');
CREATE TYPE "RunnerTargetKind" AS ENUM ('cloud_vm', 'agent', 'host');

CREATE TABLE "runner_commands" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "targetKind" "RunnerTargetKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "cwd" TEXT,
    "timeoutMs" INTEGER NOT NULL DEFAULT 120000,
    "status" "RunnerCommandStatus" NOT NULL DEFAULT 'queued',
    "exitCode" INTEGER,
    "stdout" TEXT,
    "stderr" TEXT,
    "errorMessage" TEXT,
    "requestedByProfileId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "runner_commands_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "runner_commands_workspaceId_status_idx" ON "runner_commands"("workspaceId", "status");
CREATE INDEX "runner_commands_targetKind_targetId_status_idx" ON "runner_commands"("targetKind", "targetId", "status");
