-- Epic #4: Agent Budgets / Cost. Workspace-scoped (no FK). Additive.
CREATE TYPE "BudgetScope" AS ENUM ('workspace', 'agent');
CREATE TYPE "BudgetWindow" AS ENUM ('hourly', 'daily', 'weekly', 'monthly');
CREATE TYPE "IncidentStatus" AS ENUM ('open', 'resolved');

CREATE TABLE "cost_events" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "agentId" TEXT, "model" TEXT, "provider" TEXT,
  "taskId" TEXT, "projectId" TEXT, "billerId" TEXT, "issueId" TEXT,
  "tokensIn" INTEGER NOT NULL DEFAULT 0, "tokensOut" INTEGER NOT NULL DEFAULT 0,
  "amountCents" INTEGER NOT NULL DEFAULT 0, "source" TEXT NOT NULL DEFAULT 'agent',
  "idempotencyKey" TEXT, "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cost_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cost_events_workspaceId_idempotencyKey_key" ON "cost_events"("workspaceId","idempotencyKey");
CREATE INDEX "cost_events_workspaceId_idx" ON "cost_events"("workspaceId");
CREATE INDEX "cost_events_workspaceId_occurredAt_idx" ON "cost_events"("workspaceId","occurredAt");
CREATE INDEX "cost_events_agentId_occurredAt_idx" ON "cost_events"("agentId","occurredAt");
CREATE INDEX "cost_events_provider_model_idx" ON "cost_events"("provider","model");
CREATE INDEX "cost_events_projectId_idx" ON "cost_events"("projectId");
CREATE INDEX "cost_events_taskId_idx" ON "cost_events"("taskId");
CREATE INDEX "cost_events_billerId_idx" ON "cost_events"("billerId");
CREATE INDEX "cost_events_issueId_idx" ON "cost_events"("issueId");

CREATE TABLE "budget_policies" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "scope" "BudgetScope" NOT NULL, "agentId" TEXT,
  "name" TEXT NOT NULL, "limitCents" INTEGER NOT NULL, "window" "BudgetWindow" NOT NULL DEFAULT 'monthly',
  "hardStop" BOOLEAN NOT NULL DEFAULT false, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "budget_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "budget_policies_workspaceId_scope_agentId_window_key" ON "budget_policies"("workspaceId","scope","agentId","window");
CREATE UNIQUE INDEX "budget_policies_workspace_scope_window_uniq" ON "budget_policies"("workspaceId","window") WHERE "scope"='workspace';
CREATE INDEX "budget_policies_workspaceId_idx" ON "budget_policies"("workspaceId");
CREATE INDEX "budget_policies_workspaceId_isActive_idx" ON "budget_policies"("workspaceId","isActive");
CREATE INDEX "budget_policies_agentId_idx" ON "budget_policies"("agentId");

CREATE TABLE "quota_windows" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "policyId" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL, "windowEnd" TIMESTAMP(3) NOT NULL,
  "spendCents" INTEGER NOT NULL DEFAULT 0, "breached" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "quota_windows_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "quota_windows_policyId_windowStart_key" ON "quota_windows"("policyId","windowStart");
CREATE INDEX "quota_windows_workspaceId_idx" ON "quota_windows"("workspaceId");
CREATE INDEX "quota_windows_policyId_windowEnd_idx" ON "quota_windows"("policyId","windowEnd");
CREATE INDEX "quota_windows_breached_idx" ON "quota_windows"("breached");

CREATE TABLE "budget_incidents" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "policyId" TEXT NOT NULL, "quotaWindowId" TEXT,
  "agentId" TEXT, "status" "IncidentStatus" NOT NULL DEFAULT 'open', "spendCents" INTEGER NOT NULL,
  "limitCents" INTEGER NOT NULL, "autoPaused" BOOLEAN NOT NULL DEFAULT false, "detail" TEXT,
  "resolvedById" TEXT, "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "budget_incidents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "budget_incidents_workspaceId_idx" ON "budget_incidents"("workspaceId");
CREATE INDEX "budget_incidents_policyId_status_idx" ON "budget_incidents"("policyId","status");
CREATE INDEX "budget_incidents_status_createdAt_idx" ON "budget_incidents"("status","createdAt");
CREATE INDEX "budget_incidents_agentId_idx" ON "budget_incidents"("agentId");

ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "budget_policies" ADD CONSTRAINT "budget_policies_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quota_windows" ADD CONSTRAINT "quota_windows_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "budget_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_incidents" ADD CONSTRAINT "budget_incidents_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "budget_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_incidents" ADD CONSTRAINT "budget_incidents_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill historical VM cost into the ledger (idempotent). ws_default = single-tenant bootstrap workspace.
INSERT INTO "cost_events" ("id","workspaceId","agentId","provider","amountCents","source","idempotencyKey","occurredAt","createdAt")
SELECT gen_random_uuid(), 'ws_default',
  (SELECT a."id" FROM "agents" a WHERE a."cloudVmId" = u."vmId" ORDER BY a."createdAt" LIMIT 1),
  'hetzner', u."costCents", 'cloud_vm', 'vmusage:' || u."id", u."periodEnd", now()
FROM "cloud_vm_usage" u
ON CONFLICT ("workspaceId","idempotencyKey") DO NOTHING;
