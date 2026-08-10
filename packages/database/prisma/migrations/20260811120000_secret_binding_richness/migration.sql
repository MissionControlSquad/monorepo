-- Parity §3 (secrets depth): richer SecretBinding projection + a new tool_connection scope.
-- PURELY ADDITIVE and reversible-by-drop: every new column is nullable or has a safe default that
-- reproduces today's behavior (configPath NULL → flat env-var injection; versionSelector 'latest' →
-- follow pinnedVersion ?? currentVersion; projectionClass 'env' → env-var). No backfill needed:
-- existing rows adopt the defaults, so already-created bindings resolve identically.

-- AlterEnum: widen the binding scope. New value is NOT used elsewhere in this migration (Postgres
-- forbids using a freshly-added enum value in the same transaction), so this is safe standalone.
ALTER TYPE "SecretBindingScope" ADD VALUE 'tool_connection';

-- AlterTable: additive richer-binding columns.
ALTER TABLE "secret_bindings"
    ADD COLUMN "toolConnectionId" TEXT,
    ADD COLUMN "configPath" TEXT,
    ADD COLUMN "versionSelector" TEXT NOT NULL DEFAULT 'latest',
    ADD COLUMN "projectionClass" TEXT NOT NULL DEFAULT 'env';

-- CreateIndex: tool_connection lookups.
CREATE INDEX "secret_bindings_toolConnectionId_idx" ON "secret_bindings"("toolConnectionId");
