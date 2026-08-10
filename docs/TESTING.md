# Testing Guide

Developer guide for running and writing tests in this monorepo. Everything here is verified against
the repo's real scripts (`package.json`, `turbo.json`), the CI workflows (`.github/workflows/`), and
the Vitest / Playwright configs. Where a value depends on your machine it is marked **verify in your
environment**.

The test stack has three layers:

| Layer | Runner | Needs | Command |
|-------|--------|-------|---------|
| Unit (no DB) | Vitest | nothing (pure logic) | `npm run test:unit:no-db --workspace @agentcenter/web` |
| Unit + Integration + API‑e2e | Vitest | Postgres + Redis + `.env.test` | `npm run test --workspace @agentcenter/web` |
| Browser E2E | Playwright | a built + seeded app on `:3000` | `npm run e2e` |

Prerequisites: Node `22.22.1` (the version CI pins), a local Postgres 16, and a local Redis 7.

---

## 1. Fast unit tests (no database)

The DB‑less subset runs against an explicit allowlist of files in
`apps/web/vitest.unit-no-db.config.ts` (middleware, logger, license, tenancy, crypto, budget/ledger
math, adapter registry, etc.). No `.env.test`, no `setupFiles`, no DB — it is the fastest feedback loop.

```bash
# from the repo root
cd apps/web
npm run test:unit:no-db
# or, equivalently, target a single file with the same config:
npx vitest run -c vitest.unit-no-db.config.ts tests/unit/license.test.ts
```

This is exactly what CI's **Unit (no DB)** job runs (`.github/workflows/test.yaml`), with two throwaway
Postgres URLs exported only so imports that read env don't crash.

---

## 2. Integration + API‑e2e tests (Postgres + Redis)

These share a real migrated Postgres database and Redis. The main Vitest config
(`apps/web/vitest.config.ts`) drives them:

- It loads `apps/web/.env.test` via `dotenv.config(...)` at the top of the config.
- It sets `env: { DISABLE_FLAG_CACHE: "1" }` so every feature‑flag read hits the DB fresh (the 60s
  cache goes stale when tests toggle flags in a shared process — see
  `apps/web/src/server/feature-flags.ts`).
- `fileParallelism: false` — each file runs in its own isolated worker; no cross‑file parallelism.
- `setupFiles: ["./tests/setup.ts"]` runs `prisma migrate deploy` against the test DB and
  `TRUNCATE`s all tables `beforeAll`/`afterAll` for a clean slate per file.

### 2a. Create `apps/web/.env.test`

`.env.test` is **gitignored** (CI writes its own copy). Create it once locally. Minimum contents,
mirroring the CI copy in `.github/workflows/test.yaml`:

```bash
# apps/web/.env.test
POSTGRES_PRISMA_URL="postgresql://postgres:postgres@localhost:5432/clawd_test"
POSTGRES_URL_NON_POOLING="postgresql://postgres:postgres@localhost:5432/clawd_test"
AUTH_SECRET="ci-test-secret-not-for-production"
CRON_SECRET="ci-cron-secret"
REDIS_URL="redis://localhost:6379"
NEXT_PUBLIC_MC_URL="http://localhost:3000"
```

> **Verify in your environment:** the Postgres user/password/host/db and the Redis URL. The DB name
> `clawd_test` matches CI; use whatever your local Postgres exposes.

Spin up the databases (any method works; a quick throwaway pair via Docker):

```bash
docker run -d --name pg-test  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=clawd_test -p 5432:5432 postgres:16
docker run -d --name redis-test -p 6379:6379 redis:7
```

### 2b. Run the suite

```bash
cd apps/web
npm run test                 # = npx dotenv -e .env.test -- vitest run   (all of tests/**)
npm run test:unit            # only tests/unit
npm run test:e2e             # only tests/e2e (API-level lifecycle; still needs the DB)
npm run test:watch           # watch mode

# one file / one test:
npx dotenv -e .env.test -- vitest run tests/integration/secrets.test.ts
npx dotenv -e .env.test -- vitest run -t "rejects a cross-workspace read"
```

The `.env.test` + `dotenv -e .env.test` + `DISABLE_FLAG_CACHE=1` pattern is the load‑bearing recipe:
`DISABLE_FLAG_CACHE` is set three ways (the config `env`, `tests/setup.ts` `beforeAll`, and the
`vitest.config.ts` block) so a reused worker never leaks stale flag state across files.

If a slow file trips the hook timeout during the first `migrate deploy`, raise it per‑run:

```bash
npx dotenv -e .env.test -- vitest run --hookTimeout=40000 tests/integration/finance.parity.test.ts
```

(The default `testTimeout` is 15000; there is no committed `hookTimeout`, so pass `--hookTimeout=40000`
when a cold migrate/seed needs more room.)

### 2c. Test database lifecycle

`tests/setup.ts` runs `prisma migrate deploy` for you before each file, so normally you don't touch the
DB by hand. To reset or migrate it manually:

```bash
# apply the full migration chain to the test DB (prod-faithful; not `db push`)
npm run db:migrate:deploy         # root script → packages/database

# nuke + recreate the test DB from scratch (destructive)
cd packages/database
npx dotenv -e ../../apps/web/.env.test -- npx prisma migrate reset --force   # verify path in your env
```

---

## 3. Browser E2E (Playwright)

The Playwright suite lives at the **repo root** under `e2e/` (config `e2e/playwright.config.ts`,
specs in `e2e/specs/`, auth in `e2e/setup/auth.setup.ts`). It drives the real Next.js app in Chromium.

Specs today: `agent-lifecycle.spec.ts`, `dashboard-smoke.spec.ts`, `project-create.spec.ts`,
`task-create.spec.ts`. The `setup` project logs in once (admin / `securepass123`) and saves
`e2e/.auth/admin.json`, which every spec reuses.

### 3a. One-time browser install

```bash
npm run e2e:install     # playwright install --with-deps chromium
```

### 3b. Reproduce the CI E2E job locally

CI (`.github/workflows/e2e.yaml`) builds a production server, seeds a small fixture, then runs
Playwright. To mirror it locally, point the app at a **dev** Postgres/Redis (not `clawd_test`), then:

```bash
# 1. app env for a real (non-test) run — set in apps/web/.env
#    Required by env.ts + the seed + the served app:
#      POSTGRES_PRISMA_URL, POSTGRES_URL_NON_POOLING, REDIS_URL,
#      AUTH_SECRET (>=16), CRON_SECRET, SECRET_ENCRYPTION_KEY (>=32 for `next start`),
#      LICENSE_DEV_BYPASS=1  (dev/CI-only escape hatch — never in production),
#      E2E_RATE_LIMIT_DISABLED=1, NEXT_PUBLIC_MC_URL="http://localhost:3000"

# 2. migrate + seed the fixture (admin/securepass123, ~20 agents/~100 tasks)
npm run db:migrate:deploy
cd apps/web && SEED_FAST=1 SEED_ENABLE_RUNNERS=1 npx tsx scripts/seed-enterprise.ts && cd ..

# 3. build + start the app, then run the specs
npx turbo run build --filter=@agentcenter/web
PW_WEB_COMMAND="npm run start --workspace @agentcenter/web" \
  E2E_RATE_LIMIT_DISABLED=1 ADMIN_USER=admin ADMIN_PASSWORD=securepass123 \
  npm run e2e
```

Key knobs (all from `e2e.yaml` / `e2e/playwright.config.ts`):

| Var | Why |
|-----|-----|
| `SEED_FAST=1` | small seed (~20 agents / ~100 tasks); the full enterprise seed (10k tasks) blows the job timeout |
| `SEED_ENABLE_RUNNERS=1` | seeds the `runners` flag on so the lifecycle spec can reach the RUNNERS‑gated endpoint |
| `E2E_RATE_LIMIT_DISABLED=1` | parallel Playwright workers share one IP; disables the per‑IP limiter (read at build **and** runtime) |
| `LICENSE_DEV_BYPASS=1` | lets a production `next start` boot without a signed license (guarded: non‑prod build **or** CI only) |
| `SECRET_ENCRYPTION_KEY` (≥32) | `next start` runs as `NODE_ENV=production`; without it every request 500s |
| `ADMIN_USER` / `ADMIN_PASSWORD` | `admin` / `securepass123`, provisioned by the seed |
| `PW_WEB_COMMAND` | CI boots `next start`; locally the config defaults to `next dev` and reuses a server on `:3000` |

### 3c. Everyday local commands

```bash
npm run dev                       # start the dev server on :3000 (turbo run dev)
npm run e2e                       # run all specs (attaches to a running :3000, else boots one)
npm run e2e -- e2e/specs/dashboard-smoke.spec.ts   # a single spec
npm run e2e -- --grep @smoke      # by tag/name
npm run e2e:ui                    # Playwright UI mode
npm run e2e:headed                # headed browser
npm run e2e:report                # open the last HTML report
```

Locally the config runs **serially** (`workers: 1`, one retry) because `next dev` compiles routes on
demand and drops cold parallel navigations. Once routes are warm, `npm run e2e -- --workers=4` is faster.

---

## 4. How CI runs each job (to reproduce a failure)

From `.github/workflows/test.yaml` (gate for `main`) and `e2e.yaml`:

| CI job | What it runs | Reproduce locally |
|--------|--------------|-------------------|
| **Unit (no DB)** | `cd apps/web && npm run test:unit:no-db` | same command |
| **Typecheck + Lint** | `npx turbo run typecheck` (blocking) + `npx turbo run lint` (advisory, non‑blocking) | `npx turbo run typecheck` |
| **Tests (unit+integration+e2e)** | writes `.env.test` → Postgres 16 + Redis 7 services → `npx turbo run test` | §2 above (`npm run test --workspace @agentcenter/web`) |
| **Build (web)** | `npx turbo run build --filter=@agentcenter/web` (lenient env via `NEXT_PHASE=phase-production-build`) | same command |
| **E2E (Playwright)** | `db:migrate:deploy` → `SEED_FAST=1` seed → build → `npx playwright test --config=e2e/playwright.config.ts` | §3b above |

All jobs run `cd packages/database && npx prisma generate` first — do the same after a fresh `npm ci` or
a schema change, otherwise types and the Pothos generated file are stale.

The main CI gate triggers on PRs into `main` and pushes to `main`. The E2E workflow triggers on
`workflow_dispatch`, and on pushes to `main` / `implement-new-functionalities` that touch `e2e/**` or
`apps/web/**`.

---

## 5. Conventions — where tests live and how to write one

- **Unit** (`apps/web/tests/unit/`, flat): pure functions and single‑module logic. If it needs no DB,
  add the file to the allowlist in `vitest.unit-no-db.config.ts` so it also runs in the fast job.
- **Integration** (`apps/web/tests/integration/`, flat): service‑direct and REST/GraphQL assertions
  against the real migrated DB. This is the bulk of the suite (~150 files).
- **API‑e2e** (`apps/web/tests/e2e/`, flat): full request‑level journeys (`full-flow.test.ts` walks
  setup → login → create agents → tasks → messages → deliverables → cleanup). Still Vitest + DB, no browser.
- **Browser E2E** (`e2e/specs/`): Playwright UI flows.

### Test helpers (`apps/web/tests/helpers.ts`)

Prefer these over hand‑rolling fixtures:

| Helper | Purpose |
|--------|---------|
| `adminSetup(username, password, ip?)` | create the **first** admin (one‑time); returns the session response |
| `adminLogin(username, password, ip?)` | log in; returns the response carrying the `mc_session` cookie |
| `extractSessionCookie(res)` | pull `mc_session=…` out of a response |
| `createTestAgent(overrides?)` | insert an Agent with a real generated API key → `{ agent, apiKey }` |
| `createTestTask(agentId, overrides?)` | insert a Task (auto‑creates the agent's Profile) |
| `createTestProject(overrides?)` / `addProjectMember(projectId, agentId)` | project fixtures |
| `buildRequest(method, url, {apiKey, body, headers})` | build a `Request` for a route handler (Bearer auth, `x-forwarded-for`) |
| `callRoute(handler, request, params?)` | invoke an App Router handler |
| `runGraphQL(query, variables?, cookie?)` | execute against `app/api/graphql/route` |

A typical integration test asserts **service‑direct** (call the service or route, read the DB back) and
exercises the gating explicitly: create the agent/role, toggle the feature flag, assert both the enabled
and disabled paths. Because `tests/setup.ts` truncates `feature_flags` per file, every file starts with
**all flags at their missing‑row default (enabled)** — a file that needs an opt‑in‑off flag must seed
that row in its own `beforeAll`/`beforeEach`.

### How feature flags behave in test / dev

The resolver is `apps/web/src/server/feature-flags.ts` + `apps/web/src/server/license.ts`:

- A flag row **missing** from the DB resolves to **enabled** (`flags.get(key)?.enabled ?? true`).
- If **no license** is configured (`status === NONE`), only the flag matters → enabled.
- In **development** (`NODE_ENV=development`) the license feature check is skipped entirely — the flag
  being on is enough. So *dev + no license → on*.
- Under **Vitest** (`process.env.VITEST` set by the runner) the license is bypassed; license unit tests
  still see real statuses because the bypass is keyed on `VITEST`, not on a `.env` value.
- `LICENSE_DEV_BYPASS=1` is a separate manual escape hatch for a non‑test dev/CI run (guarded so it
  cannot activate on a real production server).
- `DISABLE_FLAG_CACHE=1` forces a fresh DB read on every check (set for the whole test run).

The committed **defaults** for real deployments live in `packages/utils/src/feature-flag-keys.ts`
(`FLAG_DEFAULTS`) and are seeded on startup — see [GO-LIVE.md](./GO-LIVE.md) for the rollout table.

---

## 6. Per‑domain "how to test THIS area" index

Representative files (paths relative to `apps/web/`):

| Domain | Unit | Integration | Notes |
|--------|------|-------------|-------|
| Adapters (multi‑provider) | `tests/unit/adapters.test.ts`, `tests/unit/adapters-registry.test.ts`, `tests/unit/adapter-execute.test.ts` | `tests/integration/adapters.test.ts`, `tests/integration/runtime-adapters.test.ts`, `tests/integration/ensure-builtin-adapters.test.ts` | flag `multi_provider_adapters`; OpenClaw builtin always works |
| Secrets / vault | `tests/unit/secrets-crypto.test.ts`, `tests/unit/secret-providers.test.ts`, `tests/unit/secret-refs.test.ts` | `tests/integration/secrets.test.ts`, `tests/integration/user-secrets.test.ts`, `tests/integration/secret-resolve-audit.test.ts`, `tests/integration/secret-proposals.test.ts` | needs `SECRET_ENCRYPTION_KEY` semantics; flags `secrets_vault`, `secret_proposals` |
| Budgets / finance / ledger | `tests/unit/budget-window.test.ts`, `tests/unit/ledger-bucket.test.ts`, `tests/unit/finance-events.test.ts`, `tests/unit/cost-windows.test.ts` | `tests/integration/finance.enforcement.test.ts`, `tests/integration/finance.graphql.test.ts`, `tests/integration/finance.project-lifetime.test.ts`, `tests/integration/ledger.test.ts`, `tests/integration/budgets-rest.test.ts` | flags `budgets`, `ledger` |
| Runs / sandbox | `tests/unit/run-cost.test.ts`, `tests/unit/run-retry.test.ts`, `tests/unit/run-runtime-status.test.ts` | `tests/integration/run-state.test.ts`, `tests/integration/run-bridge.test.ts`, `tests/integration/run-reconciliation.test.ts`, `tests/integration/sandbox-run.test.ts`, `tests/integration/sandbox-providers.test.ts` (+ per‑provider `sandbox-*.test.ts`) | providers read creds from the workspace vault |
| Memory | `tests/unit/memory-providers.test.ts`, `tests/unit/memory-ranking.test.ts`, `tests/unit/memory-inspect.test.ts` | `tests/integration/agent-memory.test.ts`, `tests/integration/memory-adapter-tools.test.ts`, `tests/integration/memory-jobs.test.ts` | flag `memory` (opt‑in) |
| Work‑items / tasks | `tests/unit/task-autonomy.test.ts`, `tests/unit/work-products.test.ts`, `tests/unit/work-detail-routes.test.ts` | `tests/integration/task-autonomy.test.ts`, `tests/integration/task-relations.test.ts`, `tests/integration/human-task-review.test.ts`, `tests/integration/work-item-enhancements.test.ts` | |
| Scheduling / routines | `tests/unit/cron.test.ts`, `tests/unit/recurring-tasks.test.ts`, `tests/unit/rewake-throttle.test.ts` | `tests/integration/routine-fire-webhook.test.ts`, `tests/integration/agent-wakeups.test.ts`, `tests/integration/reap-stale-work-cron.test.ts`, `tests/integration/watchdogs.test.ts` | cron routes exercised in §Deploy crons |
| E2E lifecycle | — | `tests/e2e/full-flow.test.ts`, `tests/integration/e2e-team-lifecycle.test.ts`, `tests/integration/e2e-fresh-agent-cloud.test.ts` | browser: `e2e/specs/agent-lifecycle.spec.ts` |

---

See also: [GO-LIVE.md](./GO-LIVE.md) for the production checklist, env vars, and the feature‑flag
rollout plan.
