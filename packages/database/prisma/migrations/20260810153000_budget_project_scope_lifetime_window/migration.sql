-- Epic #4 cost & observability finish: project-scoped budgets + lifetime window.
-- Additive-first (migration-safety): new enum members, a nullable projectId column, an
-- FK, an index, and a widened uniqueness key. No backfill needed — existing rows keep
-- projectId = NULL, which matches the pre-existing (workspace|agent) semantics.

-- New BudgetScope member: a budget that caps spend across one project's agents.
ALTER TYPE "BudgetScope" ADD VALUE IF NOT EXISTS 'project';

-- New BudgetWindow member: a single perpetual window (all spend accrues forever).
ALTER TYPE "BudgetWindow" ADD VALUE IF NOT EXISTS 'lifetime';

-- Project association (required when scope = 'project'; NULL otherwise).
ALTER TABLE "budget_policies" ADD COLUMN "projectId" TEXT;

-- Widen the per-scope uniqueness key to include projectId so two different projects can
-- each hold their own (project, window) budget without colliding.
DROP INDEX IF EXISTS "budget_policies_workspaceId_scope_agentId_window_key";
CREATE UNIQUE INDEX "budget_policies_workspaceId_scope_agentId_projectId_window_key" ON "budget_policies"("workspaceId","scope","agentId","projectId","window");

CREATE INDEX "budget_policies_projectId_idx" ON "budget_policies"("projectId");

ALTER TABLE "budget_policies" ADD CONSTRAINT "budget_policies_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
