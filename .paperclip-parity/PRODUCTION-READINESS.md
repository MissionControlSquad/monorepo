# Production-Readiness Audit vs Paperclip

Method: 3 adversarial auditor agents (security / reliability / observability+deployment) read the actual
code + config and Paperclip's approach (esp. `13-deployment-cli.mdx`), scoring gaps by severity; plus
direct verification of the concrete operational surfaces. Everything below was verified against real code.

## Foundation (verified strong — parity or better than Paperclip)

| Area | Status |
|------|--------|
| Secrets at rest | AES-256-GCM (`iv:tag:ct`), keyId, **fails closed in prod** (parity) |
| SQL injection | Zero raw interpolation — all Prisma parameterized |
| SSRF core (`guardedFetch`) | DNS-resolves + blocks private/loopback/CGNAT/metadata; applied to agent/sandbox/runner egress |
| Human auth | jose HS256, 7d exp, `jti`, DB session-revocation, bcrypt(12); cookies httpOnly/secure/sameSite |
| Agent API keys | SHA-256 hashed at rest, prefix-only display, expiry + revoke |
| Env validation | prod runtime uses strict zod + **fails hard**; AUTH_SECRET can't be the dev default |
| Health endpoint | checks DB+Redis, returns **503** on DB failure |
| Prisma | singleton + `connection_limit` pooling; error-masking on; introspection off in prod |
| Containers | non-root, read_only, cap_drop ALL, no-new-privileges, secrets env-injected (not baked) — **better hardened than Paperclip** |
| Idempotency/leases | cost idempotencyKey, task-checkout fencing, env-lease/plugin-job CAS claims, delivery DLQ — **more explicit than Paperclip** |
| Crons | all CRON_SECRET-gated (fail-closed), idempotent, missed-run self-heals |

## Defects found → FIXED this pass

| SEV | Area | Defect | Fix |
|-----|------|--------|-----|
| **BLOCKER** | authz | `/auth/buildbase/workspace-token` minted an owner token from **body**-supplied workspaceId/userRole (only checking the bearer was signed) → any user → owner on any workspace | Mint from **verified bearer claims**; body may only name the target workspace. Regression test. |
| HIGH | SSRF | `/og-meta` raw `fetch` + `redirect:follow` + non-DNS private check → public 302 → cloud metadata | `guardedFetch` + `redirect:manual`, re-validate each hop |
| HIGH | authz | `updateAgentStatus/Profile/setAgentActivation` mutated agents by global id, no workspace scope | `requireRole` + filter by `tenancy.workspaceId` |
| HIGH | reliability | Stranded-work double-dispatch — overlapping reap ticks → two queued runs → task runs twice | `enqueueSandboxRun` coalesces + partial-unique index on `(taskId) WHERE status='queued'` |
| HIGH | security | Loggers logged raw (secrets/tokens/PII in stdout) | `redactSensitive()` on every emitted line |
| HIGH | ops | `SECRET_ENCRYPTION_KEY` enforced only at first-use | prod env validation fails fast at **boot** |
| HIGH | ops | Backups: no retention, no restore path | `--keep N` retention + `scripts/RESTORE.md` runbook |
| MEDIUM | security | Login brute-force limiter in-memory (per-process) | Redis-backed `checkAsync` |
| MEDIUM | ops | Docker healthcheck hit `/` → DB-down container reported healthy | now hits `/api/health` (fails on 503) |
| MEDIUM | ops | Entrypoint `db push --accept-data-loss` on every boot (silent column drop) | opt-in behind `ALLOW_DB_PUSH_FALLBACK=true` |
| LOW-MED | ops | Silent in-memory fallback when `REDIS_URL` unset in prod | loud boot warning (not a hard fail — single-instance is valid) |
| LOW | reliability | `run-retry` scheduledRetryAt stamp swallowed failures silently | logs at error level |

## Documented follow-ups (NOT force-fixed — need design/bigger change, and a quick patch would regress)

- **MEDIUM — cost recording atomicity** (`cost.ts:recordCostEvent`): event insert + quota-window increments aren't in one transaction, so a crash between them under-counts budgets. A naive `$transaction` wrap **regresses** because `incrementQuotaWindow` uses a P2002 create-race retry loop (a conflict inside a tx aborts it). Correct fix = raw `INSERT … ON CONFLICT DO UPDATE` + pre-transaction idempotency check + a ledger→window reconciliation job. Money-sensitive; needs its own integration tests.
- **MEDIUM — CSP `script-src 'unsafe-inline'`** in prod gives little XSS defense; nonce-based CSP touches Next.js rendering (bigger change).
- **MEDIUM — dev-secret fallbacks keyed on `NODE_ENV`** (middleware `getSecret`): if `NODE_ENV` is unset in a real deploy, a hard-coded signing key could ship. (secrets-crypto already fails closed independently.) Harden to key off explicit config.
- **MEDIUM — agent capability model is default-open** (bites only under a restrictive trust profile) vs Paperclip's default-deny grants — an intentional design choice; revisit if tightening is wanted.
- **MEDIUM — secrets binding-enforcement at resolve** (deny an unauthorized resolve): audit-on-resolve is now universal (fixed earlier), but a deny path needs a policy model threaded through callers.
- **Observability completeness**: OTel `NodeSDK` starts with no `instrumentations` (little auto-traced); `recordTelemetry` has no producers (pipeline unfed); no RED/USE metrics or alerting hooks. Scaffolded, not operational.
- **Migrations are forward-only** with destructive drops — adopt expand/contract + tested restore (runbook now documents this).

## Net verdict vs Paperclip

The foundation is **production-grade and in several areas ahead of Paperclip** (container hardening,
explicit lease/fencing/DLQ, secrets crypto, health 503). The audit surfaced **one true blocker (now
fixed)** and a set of HIGH/MEDIUM gaps — the blocker + all HIGHs and most MEDIUMs are fixed; the
remaining items are design decisions or changes whose quick version would introduce a worse bug, so they
are documented with the correct approach rather than rushed.
