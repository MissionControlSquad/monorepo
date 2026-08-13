-- AlterTable: profiles — add nullable buildbaseUserId (buildbase SaaS user identity this human
-- profile bridges to). Additive + nullable → safe on existing rows (admin/agent profiles stay NULL).
ALTER TABLE "profiles" ADD COLUMN "buildbaseUserId" TEXT;

-- CreateIndex: nullable-unique — Postgres allows multiple NULLs, so admin/agent profiles are
-- unaffected, while each buildbase user maps to exactly one Profile (the auth-bridge upsert key).
CREATE UNIQUE INDEX "profiles_buildbaseUserId_key" ON "profiles"("buildbaseUserId");
