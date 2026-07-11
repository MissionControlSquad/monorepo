-- Epic #16 Finance ledger: human-owned business P&L (revenue/expense). Both tables brand-new,
-- no existing rows → columns land NOT NULL immediately. No data backfill (this is NOT Epic #4 cost).

CREATE TYPE "LedgerKind" AS ENUM ('revenue', 'expense');
CREATE TYPE "LedgerSource" AS ENUM ('manual', 'import', 'api');

CREATE TABLE "ledger_events" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "kind"        "LedgerKind" NOT NULL,
  "category"    TEXT NOT NULL,
  "categoryId"  TEXT,
  "biller"      TEXT,
  "amountCents" INTEGER NOT NULL,
  "currency"    TEXT NOT NULL DEFAULT 'USD',
  "description" TEXT,
  "projectId"   TEXT,
  "source"      "LedgerSource" NOT NULL DEFAULT 'manual',
  "createdBy"   TEXT NOT NULL,
  "occurredAt"  TIMESTAMP(3) NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ledger_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ledger_categories" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "kind"        "LedgerKind" NOT NULL,
  "name"        TEXT NOT NULL,
  "archived"    BOOLEAN NOT NULL DEFAULT false,
  "createdBy"   TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ledger_categories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ledger_events_workspaceId_idx" ON "ledger_events"("workspaceId");
CREATE INDEX "ledger_events_workspaceId_occurredAt_idx" ON "ledger_events"("workspaceId", "occurredAt");
CREATE INDEX "ledger_events_workspaceId_kind_occurredAt_idx" ON "ledger_events"("workspaceId", "kind", "occurredAt");
CREATE INDEX "ledger_events_workspaceId_biller_occurredAt_idx" ON "ledger_events"("workspaceId", "biller", "occurredAt");
CREATE INDEX "ledger_events_workspaceId_category_occurredAt_idx" ON "ledger_events"("workspaceId", "category", "occurredAt");
CREATE INDEX "ledger_events_workspaceId_projectId_idx" ON "ledger_events"("workspaceId", "projectId");
CREATE INDEX "ledger_events_categoryId_idx" ON "ledger_events"("categoryId");

CREATE UNIQUE INDEX "ledger_categories_workspaceId_kind_name_key" ON "ledger_categories"("workspaceId", "kind", "name");
CREATE INDEX "ledger_categories_workspaceId_idx" ON "ledger_categories"("workspaceId");
CREATE INDEX "ledger_categories_workspaceId_kind_archived_idx" ON "ledger_categories"("workspaceId", "kind", "archived");

ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "ledger_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
