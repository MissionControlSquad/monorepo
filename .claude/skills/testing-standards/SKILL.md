---
name: testing-standards
description: >
  How to test AgentCenter features to the Definition-of-Done bar — unit + integration + e2e, plus
  mandatory cross-workspace isolation and concurrency tests. Use whenever writing tests or deciding
  what tests a change needs.
---

# Testing standards

A change is not done until its tests are green. Every requirement in an epic spec maps to ≥1 test.

## The three layers (+ two mandatory extras)

- **Unit** — `apps/web/tests/unit/*` with `vitest.unit-no-db.config.ts` (and
  `packages/database/tests/unit/*` for pure DB-layer helpers). No DB. Pure logic. Inject fakes —
  e.g. buildbase via the SDK `fetch` option; spy the event bus. Every new service function gets one.
- **Integration** — `vitest.config.ts`, real test DB. Every new resolver + every migration behavior.
- **E2E** — `apps/web/tests/e2e/*`. Every user-facing flow (dashboard + mobile parity where shipped).
- **Cross-workspace isolation (MANDATORY for any workspace-scoped feature)** — seed **two** workspaces,
  assert a query/mutation/REST call in A never returns, sums, or mutates B's rows; foreign-id
  update/delete → not-found.
- **Concurrency (MANDATORY for any atomic/claim/lease/counter)** — fire N concurrent operations via
  `Promise.all`; assert exactly-one-winner / no-lost-updates / single-row (e.g. "two agents checkout
  the same task → exactly one wins"; "20 concurrent cost increments → total is exact").

## Test-case shape (as written in specs)

Each case: **name · type · arrange · act · assert · file path.** Implement exactly those — don't rename
or skip. Prefer deterministic fixtures (no wall-clock/random — pass timestamps in).

## What every scoped feature must cover

- [ ] happy path (create/read/update/delete)
- [ ] `requireRole` denies `member`, allows `admin`
- [ ] `requireFeature` throws `FEATURE_DISABLED` when the buildbase slug is off
- [ ] cross-workspace isolation (read + write)
- [ ] concurrency (if any atomic path)
- [ ] migration backfill is idempotent (run twice → same result)
- [ ] subscription fires on the mutation (if realtime)

## Gates

Red → green before merge. CI must be green: typecheck, lint, unit, integration, e2e, migration-safety.
Never weaken an assertion to make a test pass — fix the code.
