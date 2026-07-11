# Epic #16 — Finance ledger (revenue + expenses)

**Phase:** 1 (Control plane) · **Gap:** 🟡 Medium (new bounded domain, no prior art in AgentCenter)

**Dependencies (hard preconditions):** **#1 (buildbase tenancy)** — provides `ctx.tenancy = { userId, workspaceId, role, can() }`, `requireRole(ctx,'admin')`/`requirePermission`, `scoped(ctx, where)`, the `workspaceId` backfill runner; feature plumbing `requireFeature(flag)` + `FLAG_KEYS`; the analytics cache + Pothos `builder.simpleObject` aggregate pattern. **If any is missing, stop and flag (CONVENTIONS §0).**

**Decisions-in-force:**
- **D1 — Human-owned.** A **human** bookkeeping record. Only buildbase humans (`requireRole(ctx,'admin')`) create/edit/delete. **No agent** writes, reads, or is modeled here. `createdBy` = buildbase `userId` (from `ctx.tenancy.userId`), never an `Agent.id`.
- **D2 — Two planes.** Lives entirely in the AgentCenter domain plane; bridged to buildbase only by `workspaceId`. No agent→buildbase call.
- **D3 — Shared-workspace RBAC.** All humans in a workspace see all its ledger rows. `admin` = record/edit/delete; `member` = view. Gate the mutation, not the row.
- **D5 — Workspace scoping.** `FinanceEvent`/`FinanceCategory` each carry `workspaceId String` (no FK, `@@index([workspaceId])`). Reads via `scoped(ctx, where)`; mutations via `requireRole`.

---

## 1. Header
A workspace's **profit-and-loss bookkeeping ledger**: humans record **revenue** and **expense** events (integer cents, category, optional biller/vendor, optional project attribution, occurrence date). Serves **summaries** — totals (net = revenue − expense), by-kind, by-category, by-biller, and a timeline — for a dashboard. Human-owned, workspace-scoped, gated by a `finance_ledger` feature flag.

> **This is NOT Epic #4.** Epic #4 (`CostEvent`/`BudgetPolicy`) tracks **agent LLM/run COST** (metered machine spend, auto-pause). Epic #16 tracks the **customer's own business revenue and expenses** (invoices they raised, bills they paid). Different tables, different actors (agents feed #4; humans feed #16). It is also NOT the customer's buildbase subscription (that is buildbase's). **Do not conflate, join, or auto-populate one from the other.**

## 2. Requirements
- **R1** — Admin creates a `FinanceEvent`: `kind` (revenue|expense), `category` (label, required), optional `biller`, `amountCents` (positive integer cents), optional `currency` (ISO-4217, default `"USD"`), optional `description`, optional `projectId`, `occurredAt`, `source` (default `manual`). `createdBy`/`workspaceId` from `ctx.tenancy`. Amounts are **integer cents — never floats**.
- **R2** — Admin updates a `FinanceEvent`'s mutable fields **only within the same workspace**; cross-workspace id → not-found.
- **R3** — Admin hard-deletes a `FinanceEvent` **only within the same workspace**; cross-workspace id → not-found.
- **R4** — `financeSummary(range)` → `revenueCents`, `expenseCents`, `netCents` (= revenue − expense), `currency`, `eventCount`, over the caller's workspace only, exact integer cents.
- **R5** — `financeByKind(range)` → per `kind`: `totalCents`, `eventCount`.
- **R6** — `financeByBiller(range)` → per `biller` (null → `"(unspecified)"`): `revenueCents`, `expenseCents`, `netCents`, `eventCount`, ordered by `netCents` desc.
- **R7** — `financeByCategory(range)` → per `category`, `kind`: `totalCents`, `eventCount`.
- **R8** — `financeTimeline(range, bucket)` → day/week/month buckets, each `revenueCents`/`expenseCents`/`netCents` (integer cents), zero-filled empty buckets.
- **R9** — `financeEvents(range, kind?, category?, biller?, projectId?, limit, cursor)` → paginated, workspace-scoped, ordered `occurredAt desc, createdAt desc`.
- **R10** — Admin manages optional curated `FinanceCategory` (`kind`, `name`, `archived`) per workspace, unique `(workspaceId, kind, name)`; `FinanceEvent` MAY reference via `categoryId`, but `category` label is always snapshotted.
- **R11** — Every read/summary is **workspace-isolated**; proven by test.
- **R12** — Every query + mutation gated by `requireFeature(FLAG_KEYS.FINANCE_LEDGER)`; every mutation additionally by `requireRole(ctx,'admin')`; members read-only.

## 3. Non-goals / guardrails (DO NOT)
- **DO NOT** conflate with Epic #4: no read/write of `CostEvent`/`BudgetPolicy`/`QuotaWindow`/`BudgetIncident`; no joins; no auto-create from cost events.
- **DO NOT** treat as buildbase billing: no read/write of buildbase subscription/plan/invoices.
- **DO NOT** let any **agent** touch finance: no `resolveAgent` path, no REST ingestion, no `apiKeyHash` auth.
- **DO NOT** use floats/`double`/`Decimal` for money. Integer cents only; `_sum` over `Int`; JS-integer reduce (BigInt for very large sums).
- **DO NOT** add a FK on `workspaceId`; `projectId` is a nullable `SetNull` relation only.
- **DO NOT** add a second UI kit; reuse shadcn + tokens + the `dataviz` skill.

## 4. Reuse map (path-precise)
| Need | Reuse |
|---|---|
| Feature gate | `requireFeature(flag)` — `apps/web/src/server/graphql/require-feature.ts` |
| Flag registry | `FLAG_KEYS`/`FLAG_DEFAULTS` — `packages/utils/src/feature-flag-keys.ts` |
| Human RBAC | `requireRole(ctx,'admin')` — Epic #1 |
| Scoped reads | `scoped(ctx, where)` — Epic #1 |
| Aggregate GraphQL objects | `builder.simpleObject(...)` — `queries/analytics.ts` |
| Read-through cache + invalidation | `apps/web/src/server/cache.ts` (mirror `statusCountsCache`); invalidate like `invalidateProjectsList` in `mutations/projects.ts` |
| Prisma object types | `builder.prismaObject(...)` — `packages/graphql-server/src/types/cloud-vm.ts`; register in `types/index.ts` |
| Op registration | `builder.queryField`/`mutationField` — `queries/analytics.ts`, `mutations/projects.ts`; barrels `graphql/{queries,mutations}/index.ts` |
| Data-access module | `packages/database/src/cloud-vm/` shape, re-exported from `packages/database/src/index.ts` |
| Prisma client | `packages/database/src/client.ts` |
| Optional emit | `emit` — `events/bus.ts`; add `FINANCE_EVENT_RECORDED` to `events/types.ts` + `EventTypes` |
| UI | shadcn + `<WhenWorkspaceRoles>` + `dataviz` |

## 5. Data model — `packages/database/prisma/schema/finance-ledger.prisma` (distinct from #4's `finance.prisma`)
```prisma
enum FinanceKind { revenue expense }
enum FinanceSource { manual import api }

model FinanceEvent {
  id          String        @id @default(cuid())
  workspaceId String                             // buildbase workspace _id; no FK (D5)
  kind        FinanceKind
  category    String                             // label snapshot, always set
  categoryId  String?
  biller      String?
  amountCents Int                                // integer cents, > 0 (sign carried by kind)
  currency    String        @default("USD")
  description String?
  projectId   String?
  source      FinanceSource @default(manual)
  createdBy   String                             // buildbase userId
  occurredAt  DateTime
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  categoryRef FinanceCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  project     Project?         @relation("ProjectFinanceEvents", fields: [projectId], references: [id], onDelete: SetNull)

  @@index([workspaceId])
  @@index([workspaceId, occurredAt])
  @@index([workspaceId, kind, occurredAt])
  @@index([workspaceId, biller, occurredAt])
  @@index([workspaceId, category, occurredAt])
  @@index([workspaceId, projectId])
  @@index([categoryId])
  @@map("finance_events")
}

model FinanceCategory {
  id          String      @id @default(cuid())
  workspaceId String
  kind        FinanceKind
  name        String
  archived    Boolean     @default(false)
  createdBy   String
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  events FinanceEvent[]

  @@unique([workspaceId, kind, name])
  @@index([workspaceId])
  @@index([workspaceId, kind, archived])
  @@map("finance_categories")
}
```
Edit `project.prisma` → `Project`: add `financeEvents FinanceEvent[] @relation("ProjectFinanceEvents")`.
**App-layer/zod invariants:** `amountCents > 0`; `currency` = 3 uppercase letters; `kind` matches referenced `FinanceCategory.kind`; `category` label always populated.

## 6. Migration (commands + backfill + rollback)
Both tables brand-new → columns land `NOT NULL` immediately (no existing rows). **No data backfill** (this is NOT #4's cost data).
```bash
cd packages/database
pnpm prisma migrate dev --name add_finance_ledger --create-only
# Inspect: 2 CREATE TABLEs + 2 enums + indexes + SetNull FKs. NO backfill block.
pnpm prisma migrate dev          # prod: pnpm prisma migrate deploy
pnpm prisma generate
```
Must pass migration-safety lint; runnable on seeded DB. **Rollback:** (1) `FINANCE_LEDGER=false`; (2) `prisma migrate resolve --rolled-back`; (3) `DROP TABLE finance_events; DROP TABLE finance_categories; DROP TYPE FinanceSource; DROP TYPE FinanceKind;`; (4) remove `Project.financeEvents` + regenerate. Clean (no external state touched).

## 7. API contracts
### 7a. REST — NONE (intentional)
No REST surface. Agents never touch finance (D1); the only clients are the human dashboard + mobile (GraphQL). Do **not** add any `apps/web/app/api/**` route or `resolveAgent`/`apiKeyHash` handling.

### 7b. GraphQL SDL
```graphql
enum FinanceKind { revenue expense }
enum FinanceSource { manual import api }
enum FinanceBucket { day week month }

type FinanceEvent { id: ID!  kind: FinanceKind!  category: String!  categoryId: ID  biller: String  amountCents: Int!  currency: String!  description: String  projectId: ID  source: FinanceSource!  createdBy: ID!  occurredAt: DateTime!  createdAt: DateTime!  updatedAt: DateTime! }
type FinanceCategory { id: ID!  kind: FinanceKind!  name: String!  archived: Boolean!  createdAt: DateTime!  updatedAt: DateTime! }
type FinanceSummary { revenueCents: Int!  expenseCents: Int!  netCents: Int!  currency: String!  eventCount: Int! }
type FinanceKindTotal { kind: FinanceKind!  totalCents: Int!  eventCount: Int! }
type FinanceBillerTotal { biller: String!  revenueCents: Int!  expenseCents: Int!  netCents: Int!  eventCount: Int! }
type FinanceCategoryTotal { category: String!  kind: FinanceKind!  totalCents: Int!  eventCount: Int! }
type FinanceTimelinePoint { bucketStart: DateTime!  revenueCents: Int!  expenseCents: Int!  netCents: Int! }
type FinanceEventPage { events: [FinanceEvent!]!  nextCursor: String }
input FinanceRange { from: DateTime  to: DateTime }

extend type Query {
  financeSummary(range: FinanceRange): FinanceSummary!
  financeByKind(range: FinanceRange): [FinanceKindTotal!]!
  financeByBiller(range: FinanceRange): [FinanceBillerTotal!]!
  financeByCategory(range: FinanceRange): [FinanceCategoryTotal!]!
  financeTimeline(range: FinanceRange, bucket: FinanceBucket = day): [FinanceTimelinePoint!]!
  financeEvents(range: FinanceRange, kind: FinanceKind, category: String, biller: String, projectId: ID, limit: Int = 50, cursor: String): FinanceEventPage!
  financeCategories(kind: FinanceKind, includeArchived: Boolean = false): [FinanceCategory!]!
}
extend type Mutation {
  createFinanceEvent(input: CreateFinanceEventInput!): FinanceEvent!
  updateFinanceEvent(id: ID!, input: UpdateFinanceEventInput!): FinanceEvent!
  deleteFinanceEvent(id: ID!): Boolean!
  createFinanceCategory(kind: FinanceKind!, name: String!): FinanceCategory!
  updateFinanceCategory(id: ID!, name: String, archived: Boolean): FinanceCategory!
}
input CreateFinanceEventInput { kind: FinanceKind!  category: String  categoryId: ID  biller: String  amountCents: Int!  currency: String = "USD"  description: String  projectId: ID  source: FinanceSource = manual  occurredAt: DateTime! }
input UpdateFinanceEventInput { kind: FinanceKind  category: String  categoryId: ID  biller: String  amountCents: Int  currency: String  description: String  projectId: ID  occurredAt: DateTime }
```
Every query: `requireFeature(FLAG_KEYS.FINANCE_LEDGER)` → `scoped(ctx, where)`; aggregates via Prisma `groupBy`/`aggregate` `_sum.amountCents` + `_count`, reduced to integer cents. Every mutation: `requireFeature` → `requireRole(ctx,'admin')` → write `workspaceId`/`createdBy` from ctx. Update/delete load via `scoped(ctx,{id})`; miss → `NOT_FOUND`. `amountCents<=0` → `BAD_USER_INPUT`.

## 8. File change list
**Create:** `packages/database/prisma/schema/finance-ledger.prisma`; `packages/database/src/finance-ledger/{bucket,create,find,update,delete,summary,index}.ts` (+ re-export from `src/index.ts`); `packages/graphql-server/src/types/{finance-event,finance-category}.ts`; `apps/web/src/server/graphql/{queries,mutations}/finance-ledger.ts`; `apps/web/app/(dashboard)/finance/{page.tsx,finance-event-form.tsx,manage-categories.tsx}`; `apps/mobile/.../finance.tsx`; §10 tests.
**Modify:** `project.prisma` (back-relation); `feature-flag-keys.ts` (+`FINANCE_LEDGER`); `cache.ts` (finance caches + `invalidateFinance`); `events/types.ts` + `domain-constants.ts` (+`FINANCE_EVENT_RECORDED`); `types/index.ts`, `graphql/{queries,mutations}/index.ts` (register).

## 9. Implementation order
1. Schema + `project.prisma` back-relation (R1,R10). 2. Migration `add_finance_ledger` (R1). 3. `FINANCE_LEDGER` flag (R12). 4. Data access `finance-ledger/` (`bucket.ts` pure first, unit-tested) (R1-R10). 5. GraphQL types + enums (R1,R10). 6. Queries scoped+cached (R4-R9,R11,R12). 7. Mutations gated + workspace-guard + invalidation (R1-R3,R10,R12). 8. (No REST.) 9. UI dashboard/forms/categories/mobile (R1-R10). 10. Tests red→green (§10).

## 10. Test cases (name · type · arrange · act · assert · path)
- **T1 bucketBounds daily UTC** · unit · range spanning 3 days · `bucketBounds(range,'day')` · 3 UTC-midnight buckets · `packages/database/tests/unit/finance-bucket.test.ts`.
- **T2 bucketKey weekly/monthly** · unit · boundary dates · ISO-week/month-start anchors · same file.
- **T3 summary integer-cents math** · unit · rows [rev 12345, rev 55, exp 6000] · `reduceSummary` · `rev=12400,exp=6000,net=6400,count=3`, all integers · `packages/database/tests/unit/finance-summary.test.ts`.
- **T4 amountCents guard** · unit · `0` and `-5` · both rejected · `packages/database/tests/unit/finance-validate.test.ts`.
- **T5 kind/category coherence** · unit · expense categoryId on revenue kind · rejected · same file.
- **T6 createFinanceEvent scoped** · integration · admin ctx WS A · create expense 2500 · row `workspaceId=A, createdBy=ctx.userId, amountCents=2500, source=manual` · `apps/web/tests/integration/finance-ledger.mutations.test.ts`.
- **T7 member cannot mutate** · integration · member ctx · create → `FORBIDDEN`, no row · same file.
- **T8 feature gate off** · integration · flag false · summary + create → `FEATURE_DISABLED` · same file.
- **T9 isolation read** · integration · A(rev 10000,exp 3000)+B(rev 999) · summary as A · `10000/3000/7000`; B excluded · `apps/web/tests/integration/finance-ledger.isolation.test.ts`.
- **T10 isolation update/delete** · integration · event in B; admin ctx A · update/delete → `NOT_FOUND`; B unchanged · same file.
- **T11 summary math + range** · integration · in/out-of-range rows · only in-range summed; net correct · `apps/web/tests/integration/finance-ledger.summary.test.ts`.
- **T12 byKind** · integration · two rows correct totals/counts · same file.
- **T13 byBiller null+order** · integration · null→`(unspecified)`, net-desc order · same file.
- **T14 byCategory** · integration · grouped `(category,kind)` correct · same file.
- **T15 timeline zero-fill** · integration · events day1+day3 of 3-day range · 3 points, day2 `0/0/0` · same file.
- **T16 pagination+filters** · integration · 60 events, `kind=expense,biller=AWS` · cursor paginates, ordered, no overlap · `apps/web/tests/integration/finance-ledger.list.test.ts`.
- **T17 categories unique+archive+isolation** · integration · dup `(expense,SaaS)` rejects; archived hidden; same name allowed in B · `apps/web/tests/integration/finance-ledger.categories.test.ts`.
- **T18 optional emit** · integration · bus spy · create → `FINANCE_EVENT_RECORDED` (if implemented) · T6 file.
- **T19 e2e admin records P&L** · e2e · record revenue+expense, apply range · tiles + charts + table correct · `apps/web/tests/e2e/finance.spec.ts`.
- **T20 e2e member read-only** · e2e · member opens `/finance` · data visible, edit controls absent · same file.

## 11. Definition of Done
- [ ] Schema + `Project.financeEvents` migrate additively; lint passes; generate clean (R1,R10).
- [ ] Create stores integer cents + ctx fields; `amountCents>0` enforced (R1→T4,T6).
- [ ] Update/delete workspace-guarded; foreign id → NOT_FOUND (R2,R3→T10).
- [ ] `financeSummary` exact integers; net = rev − exp (R4→T3,T11).
- [ ] byKind/byBiller(null+order)/byCategory correct (R5-R7→T12-T14).
- [ ] timeline day/week/month zero-filled UTC (R8→T1,T2,T15).
- [ ] events paginate+filter ordered (R9→T16).
- [ ] category CRUD unique+archive (R10→T5,T17).
- [ ] cross-workspace isolation proven (R11→T9,T10,T17).
- [ ] all gated `requireFeature(FINANCE_LEDGER)`; mutations `requireRole('admin')`; members read-only (R12→T7,T8,T20).
- [ ] dashboard+form+categories+mobile with loading/empty/error, role+flag gated (§5→T19,T20).
- [ ] no REST route; no agent path (D1→§7a).
- [ ] unit+integration+e2e green; CI green.

## 12. Risks (+ mitigation)
- **Confusion with #4 agent cost** → separate schema file/tables/enums, explicit non-goal, no cross-reads (reviewers verify no `CostEvent` import).
- **Float drift** → `Int` storage, `_sum` over Int, JS-integer reduce (T3); BigInt for pathological sums.
- **Mixed currencies** → v1 single workspace currency; `financeSummary.currency` = dominant/first; per-currency breakdown is a documented follow-up (never silently sum across currencies).
- **Cross-workspace leakage** (security boundary) → `scoped(ctx,where)` on reads, stamp/guard `workspaceId` on writes, load-then-check on update/delete; required tests T9/T10/T17.
- **Non-FK `workspaceId`/`projectId`** → `projectId` nullable SetNull; workspace orphans handled by #1's `workspace:deleted` reconciliation.
- **Timeline edge cases (DST/boundaries/empty)** → UTC-anchored pure `bucket.ts` + tests T1/T2 + zero-fill T15.
- **Cache staleness** → `invalidateFinance(workspaceId)` in every mutation; per-workspace-keyed caches.
