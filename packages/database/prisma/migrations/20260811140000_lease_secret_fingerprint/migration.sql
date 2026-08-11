-- Sandbox security hardening — Item 1: secret-version lease fingerprint. Additive + nullable (safe,
-- reversible):
--   • secretFingerprint — a hash over the resolved secret VERSIONS the lease's machine was provisioned
--     with (environment config/envVars secret-refs + the agent's secret bindings). Lease REUSE is gated
--     on it: when a secret is rotated its version bumps, the fingerprint changes, and the kept machine
--     (holding the STALE credential) no longer matches — so a FRESH machine is provisioned instead.
--     Existing rows backfill to NULL; a null fingerprint never matches a computed one → fail-safe fresh.
-- Rollback: DROP COLUMN "secretFingerprint";
ALTER TABLE "environment_leases" ADD COLUMN "secretFingerprint" TEXT;
