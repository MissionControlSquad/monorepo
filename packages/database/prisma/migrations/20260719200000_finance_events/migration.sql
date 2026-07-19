-- Domain 12 GAP-1: non-inference finance ledger. Additive create-table.
CREATE TABLE "finance_events" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "agentId" TEXT,
  "taskId" TEXT,
  "projectId" TEXT,
  "issueId" TEXT,
  "costEventId" TEXT,
  "eventKind" TEXT NOT NULL,
  "direction" TEXT NOT NULL DEFAULT 'debit',
  "biller" TEXT,
  "provider" TEXT,
  "billingCode" TEXT,
  "description" TEXT,
  "quantity" DOUBLE PRECISION,
  "unit" TEXT NOT NULL DEFAULT 'flat',
  "amountCents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "estimated" BOOLEAN NOT NULL DEFAULT false,
  "externalInvoiceId" TEXT,
  "idempotencyKey" TEXT,
  "metadataJson" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "finance_events_workspaceId_idempotencyKey_key" ON "finance_events"("workspaceId", "idempotencyKey");
CREATE INDEX "finance_events_workspaceId_occurredAt_idx" ON "finance_events"("workspaceId", "occurredAt");
CREATE INDEX "finance_events_workspaceId_biller_occurredAt_idx" ON "finance_events"("workspaceId", "biller", "occurredAt");
CREATE INDEX "finance_events_workspaceId_eventKind_occurredAt_idx" ON "finance_events"("workspaceId", "eventKind", "occurredAt");
CREATE INDEX "finance_events_workspaceId_direction_occurredAt_idx" ON "finance_events"("workspaceId", "direction", "occurredAt");
CREATE INDEX "finance_events_costEventId_idx" ON "finance_events"("costEventId");
