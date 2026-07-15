-- Tier C: workspace health monitors (on-demand evaluation).
CREATE TYPE "MonitorMetric" AS ENUM ('open_budget_incidents', 'open_pipeline_cases', 'active_agents', 'disabled_secrets');
CREATE TYPE "MonitorComparator" AS ENUM ('gt', 'gte', 'lt', 'lte');

CREATE TABLE "monitors" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metric" "MonitorMetric" NOT NULL,
    "comparator" "MonitorComparator" NOT NULL DEFAULT 'gt',
    "threshold" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "monitors_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "monitors_workspaceId_idx" ON "monitors"("workspaceId");
