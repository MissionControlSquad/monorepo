-- Rule-based approval-policy engine (governance depth). Additive-only: a new enum member and a new
-- approval_policies table. No backfill — with zero policy rows the engine returns default-allow and the
-- existing coarse behavior (requireAgentApproval + trust flags) is unchanged.

-- AlterEnum: a generic subject type for engine-gated agent actions (run | tool_call | …). The value is
-- only ADDED here, never used in this same migration, so it is safe inside the migration transaction.
ALTER TYPE "ApprovalSubjectType" ADD VALUE 'agent_action';

-- CreateTable: priority-ordered declarative policies. subject/condition are JSON (app-validated);
-- effect is TEXT (allow | require_approval | deny), mirroring ToolAccessPolicy. workspaceId has no FK (D5).
CREATE TABLE "approval_policies" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "subject" JSONB,
    "action" TEXT NOT NULL,
    "condition" JSONB,
    "effect" TEXT NOT NULL DEFAULT 'require_approval',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: load a workspace's enabled policies for evaluation.
CREATE INDEX "approval_policies_workspaceId_enabled_idx" ON "approval_policies"("workspaceId", "enabled");
