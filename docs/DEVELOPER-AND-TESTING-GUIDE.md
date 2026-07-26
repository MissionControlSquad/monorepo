# Developer & Testing Guide

> One place that explains **how the code is organized, how a feature flows end-to-end, and how to test
> every functionality** — plus how the test harness itself works. Written for a new contributor (human or
> agent) who needs to build, verify, or extend a feature without reading the whole tree first.

Companion docs: [`docs/`](.) (subsystem deep-dives), [`.paperclip-parity/`](../.paperclip-parity)
(port/audit history), and [`TEST-COVERAGE-MAP.md`](./TEST-COVERAGE-MAP.md) (per-service coverage +
the gaps this branch closed).

---

## 1. The mental model in one paragraph

This is an **AI-agent operations platform**. Humans manage a workspace; AI agents do work inside it.
The split that governs *where code lives*:

- **monorepo (this repo)** = the **AI-agent layer** — per-agent finance/budgets/quotas, authz, skills,
  tasks, environments, tool gateways. Everything an agent needs to run and be governed.
- **buildbase** = the **human/SaaS layer** — billing, RBAC, orgs, notification *delivery*. The monorepo
  emits events; buildbase owns the human-facing product around them.

Every feature in this repo is a **flag-gated vertical slice**, workspace-scoped, with admin-gated
mutations. If you understand one slice, you understand all of them — they are deliberately uniform.

By the numbers: **121 services**, **99 pure-logic util modules**, **70 GraphQL mutations / 82 queries**,
**66 dashboard pages**, **73 Prisma schema files**, **220 test files**.

---

## 2. Repository layout

```
monorepo/
├── apps/
│   ├── web/                     # Next.js 15.3 App Router + React 19 — the product
│   │   ├── app/
│   │   │   ├── (dashboard)/     # authenticated operator UI (66 pages, route-group)
│   │   │   ├── (auth)/          # login/signup
│   │   │   └── api/             # route handlers (graphql, agents/*, cron, health…)
│   │   ├── src/
│   │   │   ├── server/
│   │   │   │   ├── services/    # 121 DB-bound orchestration services  ← "the backend"
│   │   │   │   ├── graphql/     # mutations/ + queries/ (Pothos fields)
│   │   │   │   ├── prisma.ts    # singleton client
│   │   │   │   ├── feature-flags.ts, env.ts, cache.ts …
│   │   │   ├── components/      # React UI (ui/ kit, feature folders)
│   │   │   └── lib/             # jwt, graphql client re-exports, helpers
│   │   └── tests/               # unit/ + integration/ + e2e/  (Vitest)
│   ├── desktop/                 # Electron shell
│   └── mobile/                  # React Native shell
├── packages/
│   ├── utils/                   # 99 PURE modules — all business logic that can be unit-tested  ★
│   ├── database/prisma/schema/  # 73 split .prisma files + migrations/
│   ├── graphql-server/          # Pothos builder + type registrations (prismaObject etc.)
│   ├── graphql-client/          # typed gql operations (mutations/ + queries/)
│   ├── runner/                  # runtime-agnostic execution runner (own tests)
│   ├── mc-bridge-plugin/        # in-sandbox bridge (own tests)
│   └── types/, config/, hooks/, tailwind-config/
└── docs/, .paperclip-parity/
```

**The single most important structural fact:** _pure business logic lives in `packages/utils`, not in
the service files._ A service file (`apps/web/src/server/services/x.ts`) is a **thin orchestrator** — it
calls a pure function from `@agentcenter/utils`, then reads/writes Prisma, then returns. This is why the
test strategy in §5 works: **logic is unit-tested in `utils`; orchestration is integration-tested through
the route.** A service with "no direct test import" is usually still fully covered on both axes.

---

## 3. Anatomy of a feature — the vertical slice

Every feature is built (and should be extended) as the same 7-layer slice, in this order:

```
1. Schema      packages/database/prisma/schema/<model>.prisma   (D5: workspaceId String, no FK; TEXT status)
2. Migration   packages/database/prisma/migrations/<ts>_<name>/migration.sql
3. Service     apps/web/src/server/services/<feature>.ts        (thin: pure-util call + Prisma)
4. GraphQL     packages/graphql-server/src/types/<model>.ts     (builder.prismaObject + register in index)
               apps/web/src/server/graphql/{mutations,queries}/<feature>.ts
5. Client op   packages/graphql-client/src/{mutations,queries}/<feature>.ts  (gql template + index export)
6. UI          apps/web/app/(dashboard)/<feature>/page.tsx  or a detail-panel component
7. Tests       apps/web/tests/unit/<pure>.test.ts + tests/integration/<feature>.test.ts
```

### 3.1 Conventions that never change

- **D5 data convention:** every row carries `workspaceId String` (no foreign key — tenancy is enforced in
  code, not the DB); status fields are **TEXT, app-validated** (not Postgres enums), so new states don't
  need a migration.
- **Flag gating:** every feature has a key in `packages/utils/src/feature-flag-keys.ts` (`FLAG_KEYS`) with
  a default in `FLAG_DEFAULTS`. New/experimental features default **`false`**. The GraphQL resolver calls
  `await requireFeature(FLAG_KEYS.X)` before anything else.
- **Tenancy + role:** resolvers call `requireRole(ctx, "admin" | "member")`, which returns a tenancy
  object exposing `.workspaceId` and `.userId`. **Every query filters by `tenancy.workspaceId`; every
  mutation writes it.** Mutations that change config are `"admin"`; reads are `"member"`.
- **Migrations vs test DB:** production uses `prisma migrate` (the timestamped SQL dirs). The **test DB
  uses `prisma db push`** (see §5.2) — so anything a migration does in *raw SQL* (partial indexes,
  backfills, triggers) is **absent in tests**. Don't write a test that depends on a raw-SQL-only artifact.

### 3.2 Wiring cheat-sheet (the exact glue)

| Layer | The one line that registers it |
|-------|--------------------------------|
| GraphQL type | `builder.prismaObject("Model", {...})` in `types/<model>.ts`; add `import "./<model>"` to `types/index.ts` |
| Mutation | `builder.mutationField("setX", (t) => t.field({...}))` — first statement `await requireFeature(...)`, then `requireRole(...)` |
| Query | `builder.queryField("xs", (t) => t.prismaField({...}))` |
| Client op | `export const SET_X = gql\`...\`` then `export { SET_X } from "./<file>"` in the ops `index.ts` |
| Reachable in UI | `@/lib/graphql/{queries,mutations}` re-exports `@agentcenter/graphql-client/*` — so new ops are automatically importable as `@/lib/graphql/mutations` |
| Nav entry | add `{ href, icon, label, flag }` to `apps/web/src/components/layout/sidebar/IconRail.tsx` (icon imported from lucide block); `flag` gates visibility |

### 3.3 UI conventions

`"use client"` + urql `useQuery`/`useMutation`; UI kit from `@/components/ui` (`Button`, `Card`, `Badge`,
`Input`, `EmptyState`). `EmptyState` **requires** an `icon` prop. `BadgeVariant` ∈
`gray|blue|yellow|green|red|purple|orange|indigo`. `Button` variants `ghost|secondary|primary|danger`,
sizes include `sm`. `Switch` lives at `@/components/ui/shadcn/switch`.

---

## 4. How the request actually flows (runtime)

```
Browser (dashboard page, "use client")
  │  urql useQuery/useMutation  →  POST /api/graphql
  ▼
apps/web/app/api/graphql/route.ts   (graphql-yoga; auth from cookie: bb-workspace-token / mc_session)
  │  builds ctx { userId, workspaceId, userRole } from the VERIFIED JWT (never from the body)
  ▼
Pothos resolver (mutations/queries/<feature>.ts)
  │  1. await requireFeature(FLAG_KEYS.X)         → 403-style error if flag off
  │  2. const t = requireRole(ctx, "admin")       → error if role insufficient; returns tenancy
  │  3. call the service ─────────────────────────┐
  ▼                                               │
Service (server/services/<feature>.ts)            │  workspace-scoped
  │  pure logic  ← @agentcenter/utils  (validated, testable, no I/O)
  │  persistence ← prisma  (filtered by t.workspaceId)
  ▼
Postgres
```

Two auth surfaces exist: **human/session** (`mc_session` cookie, jose HS256) for the dashboard, and
**agent API keys** (SHA-256-hashed bearer) for the agent-facing `/api/agents/*` routes. The
`bb-workspace-token` is the buildbase→monorepo workspace JWT (claims are the source of truth — a past
BLOCKER was minting privilege from body-supplied fields; now derived only from verified claims).

---

## 5. How the tests work

### 5.1 The two-axis strategy (read this before adding a test)

| Axis | Where | What it proves | Cost |
|------|-------|----------------|------|
| **Pure unit** | `tests/unit/*.test.ts` importing `@agentcenter/utils` | the *logic* (validation, bucketing, prompt assembly, ranking, parsing) — no DB, no route | milliseconds |
| **Integration** | `tests/integration/*.test.ts` driving a real route/`POST /api/graphql` | *orchestration* — flag gate, role gate, tenancy scope, Prisma writes, end-to-end shape | needs Postgres |
| **e2e** | `tests/e2e/*.test.ts` | multi-step flows; may need Redis/live services | heaviest |

**Rule of thumb for a new feature:** put the decision logic in a pure util and unit-test it exhaustively;
add **one** integration test that proves the slice is wired (flag on → works; flag off or wrong role →
denied; data is workspace-scoped). You rarely need to unit-test the service file itself — if its only job
is "call util + Prisma," the util test + integration test already cover it.

### 5.2 The harness

- **Runner:** Vitest 4. Config: `apps/web/vitest.config.ts`.
  - `fileParallelism: false` — integration files share one Postgres DB + `process.env`, so each file runs
    in its **own isolated worker**, no cross-file parallelism (prevents order-dependent flakes).
  - `env: { DISABLE_FLAG_CACHE: "1" }` — flags are read fresh from the DB every check (the 60s cache would
    go stale across files that toggle flags). Committed so CI inherits it; the flag-cache unit test opts
    back out.
  - `@` → `apps/web/src`; `graphql` deduped to one instance (avoids cross-realm `GraphQLSchema` errors).
- **Global setup** (`tests/setup.ts`): `beforeAll` runs `prisma db push` + truncates; `afterAll`
  truncates + disconnects. It **`TRUNCATE`s `feature_flags` + `licenses` per file** so every file starts
  from all-flags-at-default; a file that needs an opt-in flag on must seed it in its own
  `beforeAll`/`beforeEach`. **No `afterEach`** — e2e files intentionally share state across `it`s.
- **Test DB uses `db push`, not `migrate`** → raw-SQL migration artifacts (partial unique indexes,
  backfills) are **not present**. Design assertions accordingly.
- **Helpers** (`tests/helpers.ts`): `adminSetup/adminLogin/adminLogout`, `createTestAgent/Task/Project`,
  `addProjectMember`, `buildRequest` (adds bearer + default `x-forwarded-for`), `callRoute` (wraps a
  route handler with the `{ params: Promise.resolve(...) }` App-Router context), and `runGraphQL(query,
  vars, cookie)` (drives `POST /api/graphql`, returns `{ data, errors }`). For **workspace-token** e2e (as
  in `api-wiring.test.ts`) mint a JWT with `createJWT({ userId, workspaceId, userRole, email }, SECRET)`
  and send it as the `bb-workspace-token` cookie.

### 5.3 Commands

From the repo root unless noted.

```bash
# Typecheck the whole monorepo (the canonical green signal)
rm -rf apps/web/.next/types && npx turbo run typecheck        # expect: 12 successful, 12 total

# Run ONE test file (fast inner loop) — from apps/web
cd apps/web && DISABLE_FLAG_CACHE=1 npx dotenv -e .env.test -- \
  npx vitest run tests/unit/<file>.test.ts --hookTimeout=40000

# Whole unit suite (no DB writes for most) / whole integration suite
cd apps/web && npm run test:unit
cd apps/web && npx dotenv -e .env.test -- npx vitest run tests/integration

# Production build of the web app
rm -rf apps/web/.next && npx turbo run build --filter=@agentcenter/web   # expect: Compiled successfully
```

Test DB (local): `postgresql://dharmikjagodana:yourpassword@127.0.0.1:5432/clawd_test`. Start Postgres
first; some e2e tests also need Redis running (they are environmentally skipped/failing without it — that
is not a product regression).

### 5.4 Anatomy of the two test styles

**Pure unit** (`tests/unit/finance-events.test.ts` — logic only, no DB):
```ts
import { describe, it, expect } from "vitest";
import { isFinanceEventKind, signedFinanceAmount, summarizeFinanceEvents } from "@agentcenter/utils";

it("validates kinds", () => expect(isFinanceEventKind("platform_fee")).toBe(true));
```

**Integration through the real route** (`tests/integration/api-wiring.test.ts` — flag + role + tenancy):
```ts
const token = await createJWT({ userId, workspaceId: WS, userRole: "admin", email }, SECRET);
// send as bb-workspace-token cookie → POST /api/graphql
it("a member cannot set an admin-gated inbox policy", async () => {
  const res = await gql(`mutation{ setInboxPolicy(itemKind:"mention", action:"ignore"){ id } }`, {}, "member");
  expect(res.errors).toBeTruthy();
  expect(res.data?.setInboxPolicy ?? null).toBeNull();   // denied → error + null data
});
```

The **three things every integration test should assert** for a flag-gated, admin-gated, scoped feature:
1. **Happy path** — flag on + right role → mutation succeeds, query returns the row.
2. **Gate** — wrong role (or flag off) → `errors` truthy and data null.
3. **Tenancy** — a row in workspace A is invisible to workspace B.

---

## 6. "How do I test _feature X_?" — the map

Feature flags in `FLAG_KEYS` are the index of what the platform does. To exercise any feature:

1. **Enable its flag** — UI: *Settings → Feature flags*; test: `prisma.featureFlag.upsert({ ... enabled:true })`
   then `invalidateFlagCache()`.
2. **Find its slice** — service `apps/web/src/server/services/<feature>.ts`, GraphQL op of the same name,
   UI page `app/(dashboard)/<feature>/page.tsx` (or a detail panel), test
   `tests/integration/<feature>.test.ts`.
3. **Run its test file** (§5.3) and/or click through the page with the flag on.

Representative slices and where each is verified (non-exhaustive; the pattern is uniform):

| Feature (flag) | Service | GraphQL | UI surface | Test file(s) |
|---|---|---|---|---|
| Assets (`assets`) | `assets.ts` | `recordAsset`/`assets` | `/assets` page | `integration/assets.test.ts`, `api-wiring.test.ts` |
| Inbox policies (`inbox_policy`) | `inbox-policies.ts` | `setInboxPolicy` | `/inbox-policies` | `integration/inbox-policies.test.ts`, `api-wiring.test.ts` |
| Skill comments (`skills_teams`) | `skill-comments.ts` | `addSkillComment` | Skills → Comments panel | `api-wiring.test.ts` |
| External objects (`external_objects`) | `external-objects.ts` | `upsertExternalObject` | Task → GitHub links | `integration/external-objects.test.ts` |
| Doc annotations (`annotations`) | `document-annotations.ts` | `createAnnotationThread` | Doc viewer select-to-annotate | `integration/document-annotations.test.ts` |
| Agent skill sync (`skills_teams`) | `agent-skills-sync` | snapshot query | Agent → skill-sync status | `integration/agent-skills-sync.test.ts` |
| Smoke lab (`smoke_lab`) | `smoke-case` svc | `runSmokeSuite` | `/smoke-lab` | `integration/*smoke*`, gateway tests |
| Finance/ledger (`ledger`,`budgets`) | `finance-events.ts`, `cost.ts` | finance queries | finance pages | `unit/finance-events.test.ts`, `integration/finance.*.test.ts` |
| Boardroom (`board_chat`) | `boardroom.ts` | board mutations | board chat | `unit/boardroom.test.ts`, `integration/boardroom.test.ts` |
| Observability (`observability`) | `observability.ts` | metrics queries | dashboards | `unit/observability.test.ts`, `integration/observability.test.ts` |

> See [`TEST-COVERAGE-MAP.md`](./TEST-COVERAGE-MAP.md) for the full per-service coverage table and the
> exact gaps this branch identified and closed.

---

## 7. Adding or changing a feature — the checklist

1. Add `FLAG_KEYS.X` + `FLAG_DEFAULTS[X] = false` (default off for anything new).
2. Schema (`.prisma`, D5 conventions) → `prisma migrate` for a real migration dir.
3. Service: put logic in a **pure util** (`packages/utils`), keep the service thin.
4. GraphQL: type + mutation/query; first lines `requireFeature` then `requireRole`; scope by `workspaceId`.
5. Client op (`gql` + index export) → automatically reachable via `@/lib/graphql/*`.
6. UI: page or detail panel; add nav entry gated on the flag.
7. **Tests:** exhaustive unit test on the util; **one** integration test asserting happy-path + gate +
   tenancy (§5.4).
8. Verify: `typecheck` (12/12) → the new test file green → web `build` compiles. Then commit
   (`--no-verify` to skip the reformat hook; `Co-Authored-By` trailer).

---

## 8. Gotchas (things that have actually bitten)

- **`requireFeature` reads the DB**: in a unit test that touches a resolver, set `DISABLE_FLAG_CACHE=1`
  (already in vitest config) and seed the flag row, or the gate reads a stale/absent flag.
- **Denied mutations mask the message**: assert `errors` truthy + `data` null rather than a specific
  string — graphql-yoga may mask `"Requires 'admin' role"`.
- **`env.ts` production checks** belong in `validateEnv()`, **not** `.superRefine` on the schema —
  a refinement breaks `lenientSchema.extend()` at import time (bit the SECRET_ENCRYPTION_KEY boot check).
- **Raw-SQL migration artifacts are invisible in tests** (`db push` ≠ `migrate`) — e.g. a partial unique
  index enforced only in prod. Don't assert on it in an integration test.
- **Test files share the DB** — truncate what you create in `beforeEach`, and seed opt-in flags per file.
