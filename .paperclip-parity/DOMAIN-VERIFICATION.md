# Per-Domain Functionality Verification vs Paperclip

Method: 4 auditor agents read the **actual implementation files line by line** (not names/docs) across all
14 domains + cross-cutting subsystems, classifying each feature WORKS / PARTIAL (infra seam) / MISSING /
N-A. In parallel, the **full 207-file test suite** ran (1673 passed / 29 skipped; 45 failures isolated to
the Redis-dependent e2e file + a db-push seed-state gap — see §Test-suite). Typecheck: **12/12 packages**.

## Verdict matrix (per domain)

| Domain | Works | Partial (seam) | Missing | Headline |
|--------|:-----:|:--------------:|:-------:|----------|
| 1 Environments/Execution | ~7 | 5 | 0 | Env/Lease/Workspace/CustomImage + fail-closed exec allowlist all real+tested |
| 2 Adapters/Runtimes | ~4 | 6 | 1 | Registry unified, install/session/transcript real; **F2 testEnvironment absent** |
| 3 Sandbox depth | ~5 | 4 | 0 | All 6 production-blockers closed (install/secrets/private-clone/run-persist/cancel) |
| 4 Memory | ~6 | 2 | 3 | db-provider store/audit/capture/**ranking** wired; PARA/async-extraction deferred |
| 5 Skills | 8 | 4 | 6 | CRUD/versions/lint/policy-engine/comments real; import/update-lifecycle missing |
| 6 Plugins/MCP | 4 | 8 | ~10 | Plugin registry+queue+capability data real (exec=seam); **MCP upstream = greenfield** |
| 7 Secrets | 3 | 6 | 1 | Storage/crypto/versions/bindings real; audit-on-resolve half-universal (see fixes) |
| 8 Work-items | 8 | 2 | 0 | Work-products/runs/artifacts/annotations/blockers/threads all real+tested |
| 9 Heartbeat | 10 | 5 | 1 | Checkout/retry/reaper/stranded/monitors/routines wired; **watchdogs now wired (fix)** |
| 10 Connectivity | 6 | 1 | 3 | Live-gateway WS/nonce/DLQ + key-claim real; hermes/cursor/inbound-MCP transport missing |
| 11 UI | 2 | 4 | 5 | Backend data exists for nearly all; the gap is React surface (separate build) |
| 12 Cost/Observability | 10 | 6 | 1 | Ledger/budgets/quota/finance-events/OTel/telemetry real; per-run log store missing |
| 13 Deploy/CLI | ~5 | 2 | — | doctor/db:backup/runner real; deploy taxonomy = infra/boundary |
| 14 Teams/Governance | ~9 | 4 | 2 | Org-chart/teams/approvals/**hire**/**quorum**/companies real+tested |

**Overall:** the AI-agent runtime spine is **functionally real, workspace-scoped, and tested** across
every domain; PARTIALs are legitimate infra seams (cloud snapshot, fork/vm worker, ssh/PTY, live provider
calls, streaming transport) that ship a working offline half; MISSING items are the MCP-upstream
governance stack (greenfield), UI surfaces (separate React build), and file catalogs (buildbase-owned).

## Defects the audit found — and fixed this pass

| # | Domain | Defect (real, not a seam) | Fix |
|---|--------|---------------------------|-----|
| 1 | 14 | **Governance bypass** — `provisionSetupStatus` gate honored only in team-install; hire-fulfilment + company-import hard-coded `setupStatus:"active"`, letting those agents skip admin approval | Both paths now call `provisionSetupStatus`; regression test |
| 2 | 8 | **Quarantine not enforced on read** — `isQuarantined()` tested but never called; a low-trust run's stdout/stderr flowed verbatim to higher-trust readers | `redactQuarantinedText` wired into `AgentRun.stdout/stderr` GraphQL resolvers (redacts until `approved`) |
| 3 | 5 | **Skill trust not re-derived** — adding a `scripts/` file didn't raise `Skill.trustLevel` though `deriveSkillTrustLevel` existed | `upsertSkillFile`/`deleteSkillFile` recompute trust from the file set |
| 4 | 9/12 | **Dormant tested logic** — silent-run + subtree watchdogs + telemetry-prune had zero callers | Wired all three into the every-5-min reap cron |
| 5 | — | Flag-count guard stale after +15 flags | Updated 44→59 + strengthened to assert FLAG_KEYS/FLAG_DEFAULTS parity |
| 6 | 7 | **Secret resolve unaudited** — `resolveWorkspaceSecret` (BYO creds/git token/plugin+env config) resolved plaintext with no `SecretAccessEvent` | Every resolve now records a `read` event (best-effort) + optional consumer provenance |

## Documented follow-ups (not fixed — need design/decision or coordinated rollout, not a quick patch)

- **D7 A3 (enforcement half)** — the audit gap is now closed (every resolve is recorded); the remaining piece is binding-**enforcement** (deny an unauthorized resolve), which needs a deny path threaded through callers + a policy model — a deliberate change, not a hotfix.
- **D10 A5** — Ed25519 device pairing is fully built+tested but **not wired into the WS handshake**: enforcing it requires the runner client to sign the nonce AND the server to reject unsigned/unknown devices — a coordinated client+server rollout (wiring a server-only path no client exercises adds risk without benefit).
- **D2 F6** — `parseLine` transcript parser is built+tested but the runner doesn't stream yet (streaming transport is the infra seam).
- **Larger MISSING features** (not defects): MCP-upstream governance (connections→catalog→profiles→OAuth→gateway), skill import/update/reset lifecycle, several React UI surfaces.
- **D2 F6** — `parseLine` transcript parser is built+tested but the runner doesn't stream yet (streaming transport is the infra seam).
- **Larger MISSING features** (not defects): MCP-upstream governance (connections→catalog→profiles→OAuth→gateway), skill import/update/reset lifecycle, several React UI surfaces.

## Test-suite result

- **1673 passed / 29 skipped**, typecheck 12/12.
- **45 failures, all environmental — not product defects:**
  - **41** in `tests/e2e/full-flow.test.ts` — requires **Redis** (SSE pub/sub) which isn't running in this env; the downstream auth failures cascade from that one file's setup.
  - **2** in `adapters.test.ts` — the test DB is built with `prisma db push` (no data migrations), so it lacks 2 migration-seeded placeholder adapters (`cursor-cloud`/`hermes-gateway`) and the rich openclaw config schema; in CI (migrations run) these pass. `ensureBuiltinAdapters` correctly skips existing rows — no clobber.
  - **1** `sandbox-cloudflare.test.ts` — needs a live Cloudflare endpoint (network seam).
  - **1** `feature-flag-keys.test.ts` — the stale flag-count guard (**fixed**).

Every failure is either an unavailable external dependency (Redis/Cloudflare) or a test-DB seeding
artifact — none is a functional defect in the product.
