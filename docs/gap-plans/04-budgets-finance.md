# Epic #4 — Agent Budgets / Cost (agent spend + auto-pause)

**Epic id:** #4 · **Phase:** 1 (Control plane) · **Gap:** 🔴 Large
**Dependencies (hard preconditions):** **#1 (buildbase tenancy → `ctx.tenancy.workspaceId`, `requireRole`)** — provides `ctx.tenancy` (with `workspaceId`, `requireRole(ctx, 'admin')`, `requirePermission`), the `scoped(ctx, where)` helper, the two-arg `requireFeature(ctx, slug)` binding to buildbase feature entitlement, and the single-tenant **default workspace id** used by the migration backfill runner. This epic **must not** be implemented before #1 lands those artifacts. Reuses the CloudVM cost convention (`CloudVMUsage.costCents`), the event bus, `agent-status.ts` auto-pause (`applyAgentStatusUpdate`), and the `queries/analytics.ts` cached-aggregate pattern.

**Decisions-in-force (restated from CONVENTIONS §0):**
- **D1 — buildbase = humans only.** No agent is modeled as a buildbase user. The **only** buildbase touchpoint in this epic is reading the workspace's buildbase **subscription/plan quota** (e.g. max agents) at **agent-create time** (R11); agent cost detail is an AgentCenter ledger, never a buildbase bill.
- **D2 — Two planes, one bridge.** Agents ingest cost via `Agent.apiKeyHash` (`resolveAgent`) and never call buildbase. No agent→buildbase call is added.
- **D3 — Shared-workspace RBAC.** Every human in a workspace sees all of its budgets/incidents/spend. Capability is gated on the **mutation** via buildbase role (`admin` = manage, `member` = view). No per-object ACL.
- **D4 — What stays in AgentCenter.** `CostEvent` / `BudgetPolicy` / `QuotaWindow` / `BudgetIncident` and auto-pause live in AgentCenter Postgres, scoped by `workspaceId`. The retired `License` singleton and local `FeatureFlag` model are **not** used to gate this epic — gating is buildbase feature `requireFeature(ctx, FLAG_KEYS.BUDGETS)`.
- **D5 — Workspace scoping.** Every new root row carries `workspaceId String` (buildbase workspace `_id`; **no Prisma FK**; always `@@index([workspaceId])`). Every read resolver calls `scoped(ctx, where)`; every mutation authorizes via `requireRole(ctx, 'admin')` on `ctx.tenancy`.

> **⚑ Scope.** This epic is **agent LLM/run cost tracking + budget policies + auto-pause ONLY.** Business revenue/expense bookkeeping (double-entry finance ledger, invoices, payouts) is a **separate epic (#16 Finance ledger)** and is explicitly **out of scope** here — do not add it.

---

## 1. Requirements

- **R1.** The system MUST persist an agent/run cost record (`CostEvent`) carrying `workspaceId`, optional `agentId`, `model`, `provider`, `taskId`, `projectId`, `billerId`, `issueId`, `tokensIn`, `tokensOut`, `amountCents` (integer cents, no floats), `source ∈ {agent, cloud_vm, manual}`, and `occurredAt`.
- **R2.** The system MUST accept cost ingestion from an agent/VM over REST `POST /api/cost-events` authenticated by `apiKeyHash` (`resolveAgent`), and from the agent heartbeat via an optional `costDelta` field. Both paths MUST funnel through the single service `recordCostEvent`.
- **R3.** The system MUST let a workspace **admin** create/update/delete `BudgetPolicy` rows with `scope ∈ {workspace, agent}`, `limitCents`, `window ∈ {hourly, daily, weekly, monthly}`, `hardStop`, `isActive` — via GraphQL and REST, all gated by `requireRole(ctx, 'admin')` + `requireFeature(ctx, FLAG_KEYS.BUDGETS)`.
- **R4.** On each `recordCostEvent`, the system MUST **atomically** upsert-and-increment the running `QuotaWindow.spendCents` for **every** matching active policy: the workspace-scope policy AND (if `agentId` set) the matching agent-scope policy for the current window. The increment MUST be race-safe under concurrent ingestion.
- **R5.** After the running total is updated, the system MUST evaluate breach asynchronously via the event bus: `recordCostEvent` emits `COST_EVENT_RECORDED`; `handlers/budget.ts` runs `checkBreach`. A window is **breached** when `spendCents >= limitCents`.
- **R6.** On a first breach of a policy window, the system MUST mark `QuotaWindow.breached = true` and open exactly **one** `BudgetIncident` (idempotent per window — no duplicate incident while one is already `open`).
- **R7.** When the breached policy has `hardStop = true`, the system MUST auto-pause the affected agent(s) by calling `applyAgentStatusUpdate(agentId, { status: 'blocked', statusMessage: 'Auto-paused: budget limit reached' })` — reusing the existing `AgentStatus.blocked` state and status/history/notification machinery — and set `BudgetIncident.autoPaused = true`. For `scope = agent`, pause that agent; for `scope = workspace`, pause every active agent in the workspace.
- **R8.** When `hardStop = false`, the system MUST still record the incident but MUST NOT change any agent status.
- **R9.** An admin MUST be able to `resolveBudgetIncident` (sets `status = resolved`, `resolvedAt`, `resolvedById`). Resolving MUST NOT auto-unpause the agent (reactivation is a separate, explicit `updateAgentStatus` action — documented in the runbook).
- **R10.** The system MUST expose cost analytics: `costBreakdown(groupBy: agent | model | provider | project | biller | issue)`, `costTrend`, `financeSummary` (total spend + per-window budget utilization), and `agentWindowSpend(agentId)` — each `scoped(ctx, …)`, cached like `queries/analytics.ts`, and gated by `requireFeature(ctx, FLAG_KEYS.BUDGETS)`.
- **R11.** At **agent-create time only**, the system MUST enforce the workspace's buildbase **plan quota** (e.g. max agents) by reading the workspace's buildbase subscription/quota; exceeding it MUST reject the create with a `PLAN_LIMIT_EXCEEDED` error. This is the **only** buildbase touchpoint in the epic.
- **R12.** The system MUST publish `budgetIncidentChanged` over graphql-ws when an incident opens or resolves, so dashboards show live auto-pause.
- **R13.** The migration MUST backfill historical VM cost from `CloudVMUsage.costCents` into `CostEvent(source='cloud_vm')`, idempotently, using the **default workspaceId supplied by the backfill runner** (single-tenant install) — not a `SELECT id FROM organizations`.
- **R14.** Every list/read MUST be workspace-isolated: a query in workspace A MUST NEVER return workspace B's `CostEvent`/`BudgetPolicy`/`QuotaWindow`/`BudgetIncident` rows.

## 2. Non-goals / guardrails (DO NOT)

- **DO NOT** implement business revenue/expense/double-entry bookkeeping, invoices, payouts, or a finance ledger — that is epic #16.
- **DO NOT** introduce a new "paused" status enum value or a parallel pause mechanism; reuse `AgentStatus.blocked` + `applyAgentStatusUpdate` exactly.
- **DO NOT** gate this epic on the retired `License.features` / local `FeatureFlag` model. Gate on buildbase feature via `requireFeature(ctx, FLAG_KEYS.BUDGETS)` **only** (single gate, not "double-gated").
- **DO NOT** add any agent→buildbase call, and DO NOT touch agent auth (`apiKeyHash`/`resolveAgent`), the mc-bridge wire protocol, or existing agent lifecycle endpoints except to (a) add `workspaceId` scoping and (b) additively read an optional `costDelta` on the heartbeat.
- **DO NOT** call buildbase anywhere except the agent-create quota check (R11).
- **DO NOT** rename or reuse the draft's `orgId` column — the tenancy column is **`workspaceId String`** (indexed, no FK) everywhere.
- **DO NOT** perform breach evaluation or auto-pause synchronously inside the hot ingestion write; only the insert + atomic increment is synchronous, breach runs on the bus.
- **DO NOT** auto-unpause an agent when an incident is resolved.
- **DO NOT** return an agent's cost data across workspace boundaries; workspace isolation is a security boundary.

## 3. Reuse map (exact existing files/functions)

| Need | Reuse (path-precise) |
|---|---|
| Auto-pause writer + status history/activity emit | `apps/web/src/server/agent-status.ts` → `applyAgentStatusUpdate(agentId, { status: 'blocked', statusMessage })` (emits `AGENT_STATUS_APPLIED`). |
| Atomic transaction pattern | `packages/database/src/agent/update.ts` → `updateAgentStatusAtomically` (model for `prisma.$transaction`; QuotaWindow increment mirrors it). |
| Cost-in-cents + VM cost source | `packages/database/prisma/schema/cloud-vm.prisma` → `CloudVMUsage.costCents` (per-period cost — the source; NOT `estimatedCostCents`, which is a lifetime estimate on `CloudVM`). |
| VM → ledger feed | `apps/web/src/server/services/cloud-vm-cron.ts` → emit a `CostEvent(source='cloud_vm')` via `recordCostEvent` when writing a `CloudVMUsage` period. |
| Event bus + handler registration | `apps/web/src/server/events/bus.ts` (`emit`, `on`), `events/index.ts`, `events/types.ts`, `EventTypes` in `packages/utils/src/domain-constants.ts`. |
| Notifications on incident | `apps/web/src/server/events/handlers/notification.ts`. |
| Cached aggregate resolver pattern | `apps/web/src/server/graphql/queries/analytics.ts` + `apps/web/src/server/cache.ts`; raw SQL helpers mirror `getAgentWorkloadRaw` in `@agentcenter/database`. |
| Feature gate | `apps/web/src/server/graphql/require-feature.ts` → `requireFeature(ctx, FLAG_KEYS.BUDGETS)`. Flag registry: `packages/utils/src/feature-flag-keys.ts`. |
| Human RBAC | `requireRole(ctx, 'admin')` (from #1). |
| Agent RBAC (REST) | `apps/web/app/api/_lib/resolve-agent.ts`; session `_lib/resolve-session.ts`. |
| REST plumbing | `_lib/json-response.ts`, `_lib/validation.ts`, `_lib/with-rate-limit.ts`. |
| Cron guard | `apps/web/app/api/cron/auto-sleep/route.ts` (`env.CRON_SECRET`). |
| Realtime | `apps/web/src/server/pubsub.ts` + graphql-ws. |
| DB module layout | `packages/database/src/cloud-vm/` re-exported from `packages/database/src/index.ts`. |
| GraphQL prismaObject types | `packages/graphql-server/src/types/cloud-vm.ts`, registered in `types/index.ts`. |

**Genuinely new:** `BudgetPolicy` / `QuotaWindow` / `BudgetIncident` (no budget concept) and `CostEvent` (VM usage has no agent/model/provider/token/biller/issue dims; one unified ledger feeding from both agent and VM sources).

## 4. Data model (exact Prisma) — `packages/database/prisma/schema/finance.prisma`
```prisma
enum BudgetScope   { workspace agent }
enum BudgetWindow  { hourly daily weekly monthly }
enum IncidentStatus { open resolved }

model CostEvent {
  id          String   @id @default(cuid())
  workspaceId String                       // buildbase workspace _id; no FK (D5)
  agentId     String?
  model       String?
  provider    String?
  taskId      String?
  projectId   String?
  billerId    String?
  issueId     String?
  tokensIn    Int      @default(0)
  tokensOut   Int      @default(0)
  amountCents Int      @default(0)          // integer cents, no floats
  source      String   @default("agent")   // "agent" | "cloud_vm" | "manual"
  idempotencyKey String?
  occurredAt  DateTime @default(now())
  createdAt   DateTime @default(now())

  agent   Agent?   @relation(fields: [agentId], references: [id], onDelete: SetNull)
  task    Task?    @relation(fields: [taskId], references: [id], onDelete: SetNull)
  project Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)

  @@unique([workspaceId, idempotencyKey])
  @@index([workspaceId])
  @@index([workspaceId, occurredAt])
  @@index([agentId, occurredAt])
  @@index([provider, model])
  @@index([projectId])
  @@index([taskId])
  @@index([billerId])
  @@index([issueId])
  @@map("cost_events")
}

model BudgetPolicy {
  id          String       @id @default(cuid())
  workspaceId String
  scope       BudgetScope
  agentId     String?                      // required when scope=agent
  name        String
  limitCents  Int
  window      BudgetWindow @default(monthly)
  hardStop    Boolean      @default(false)
  isActive    Boolean      @default(true)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  agent     Agent?           @relation(fields: [agentId], references: [id], onDelete: Cascade)
  windows   QuotaWindow[]
  incidents BudgetIncident[]

  @@unique([workspaceId, scope, agentId, window])
  @@index([workspaceId])
  @@index([workspaceId, isActive])
  @@index([agentId])
  @@map("budget_policies")
}

model QuotaWindow {
  id          String   @id @default(cuid())
  workspaceId String
  policyId    String
  windowStart DateTime
  windowEnd   DateTime
  spendCents  Int      @default(0)
  breached    Boolean  @default(false)
  updatedAt   DateTime @updatedAt

  policy BudgetPolicy @relation(fields: [policyId], references: [id], onDelete: Cascade)

  @@unique([policyId, windowStart])          // upsert target — race-safe increment
  @@index([workspaceId])
  @@index([policyId, windowEnd])
  @@index([breached])
  @@map("quota_windows")
}

model BudgetIncident {
  id            String         @id @default(cuid())
  workspaceId   String
  policyId      String
  quotaWindowId String?
  agentId       String?
  status        IncidentStatus @default(open)
  spendCents    Int
  limitCents    Int
  autoPaused    Boolean        @default(false)
  detail        String?
  resolvedById  String?
  resolvedAt    DateTime?
  createdAt     DateTime       @default(now())

  policy BudgetPolicy @relation(fields: [policyId], references: [id], onDelete: Cascade)
  agent  Agent?       @relation(fields: [agentId], references: [id], onDelete: SetNull)

  @@index([workspaceId])
  @@index([policyId, status])
  @@index([status, createdAt])
  @@index([agentId])
  @@map("budget_incidents")
}
```
Edits (back-relations only): `agent.prisma` `Agent` += `costEvents`/`budgetPolicies`/`budgetIncidents`; `task.prisma` `Task` += `costEvents`; `project.prisma` `Project` += `costEvents`.

## 5. Migration (commands + backfill + rollback)
```bash
cd packages/database
pnpm prisma migrate dev --name add_agent_budgets --create-only
```
Append to the generated `migration.sql`:
```sql
-- Workspace-scope policy uniqueness (agentId IS NULL not covered by the composite @@unique)
CREATE UNIQUE INDEX "budget_policies_workspace_scope_window_uniq"
  ON "budget_policies" ("workspaceId", "window") WHERE "scope" = 'workspace';

-- Backfill historical VM cost (idempotent). :default_workspace_id from the backfill runner (#1).
INSERT INTO "cost_events"
  ("id","workspaceId","agentId","provider","amountCents","source","idempotencyKey","occurredAt","createdAt")
SELECT gen_random_uuid(), :default_workspace_id,
       (SELECT a."id" FROM "agents" a WHERE a."cloudVmId" = u."vmId" ORDER BY a."createdAt" LIMIT 1),
       'hetzner', u."costCents", 'cloud_vm', 'vmusage:' || u."id", u."periodEnd", now()
FROM "cloud_vm_usage" u
ON CONFLICT ("workspaceId","idempotencyKey") DO NOTHING;
```
```bash
pnpm prisma migrate dev            # prod: pnpm prisma migrate deploy
pnpm prisma generate
```
`QuotaWindow` rows are created lazily (upsert on `@@unique([policyId, windowStart])`). Must pass migration-safety lint; runnable on a seeded DB; idempotent. **Rollback:** (1) buildbase feature `budgets`=false; (2) `prisma migrate resolve --rolled-back`; (3) drop FK-safe: `budget_incidents`, `quota_windows`, `budget_policies`, `cost_events`, then the 3 enums, then remove back-relations. **Runbook caveat:** agents auto-paused (`blocked`) stay blocked after rollback until manually reactivated.

## 6. API contracts
### GraphQL SDL
```graphql
enum BudgetScope { workspace agent }
enum BudgetWindow { hourly daily weekly monthly }
enum IncidentStatus { open resolved }
enum CostGroupBy { agent model provider project biller issue }

type CostEvent { id: ID!  agentId: String  model: String  provider: String  taskId: String  projectId: String  billerId: String  issueId: String  tokensIn: Int!  tokensOut: Int!  amountCents: Int!  source: String!  occurredAt: DateTime! }
type BudgetPolicy { id: ID!  scope: BudgetScope!  agentId: String  name: String!  limitCents: Int!  window: BudgetWindow!  hardStop: Boolean!  isActive: Boolean!  currentWindowSpendCents: Int!  createdAt: DateTime!  updatedAt: DateTime! }
type QuotaWindow { id: ID!  policyId: String!  windowStart: DateTime!  windowEnd: DateTime!  spendCents: Int!  breached: Boolean! }
type BudgetIncident { id: ID!  policyId: String!  agentId: String  status: IncidentStatus!  spendCents: Int!  limitCents: Int!  autoPaused: Boolean!  detail: String  resolvedById: String  resolvedAt: DateTime  createdAt: DateTime! }
type CostBucket { key: String!  label: String  amountCents: Int!  eventCount: Int! }
type CostTrendPoint { date: String!  amountCents: Int! }
type FinanceSummary { totalSpendCents: Int!  windowSpendCents: Int!  activePolicies: Int!  openIncidents: Int! }
type AgentWindowSpend { policyId: String!  window: BudgetWindow!  spendCents: Int!  limitCents: Int!  breached: Boolean! }

extend type Query {
  budgetPolicies: [BudgetPolicy!]!
  budgetPolicy(id: ID!): BudgetPolicy
  budgetIncidents(status: IncidentStatus): [BudgetIncident!]!
  costBreakdown(groupBy: CostGroupBy!, from: DateTime, to: DateTime, projectId: String): [CostBucket!]!
  costTrend(days: Int = 30, projectId: String): [CostTrendPoint!]!
  financeSummary(window: BudgetWindow): FinanceSummary!
  agentWindowSpend(agentId: ID!): [AgentWindowSpend!]!
}
extend type Mutation {
  createBudgetPolicy(scope: BudgetScope!, agentId: String, name: String!, limitCents: Int!, window: BudgetWindow!, hardStop: Boolean): BudgetPolicy!
  updateBudgetPolicy(id: ID!, name: String, limitCents: Int, window: BudgetWindow, hardStop: Boolean, isActive: Boolean): BudgetPolicy!
  deleteBudgetPolicy(id: ID!): Boolean!
  ingestCostEvent(agentId: String, model: String, provider: String, taskId: String, projectId: String, billerId: String, issueId: String, tokensIn: Int, tokensOut: Int, amountCents: Int!, source: String, idempotencyKey: String): CostEvent!
  resolveBudgetIncident(id: ID!, detail: String): BudgetIncident!
}
extend type Subscription { budgetIncidentChanged: BudgetIncident! }   # scoped to ctx.tenancy.workspaceId
```
Every query: `requireFeature(ctx, FLAG_KEYS.BUDGETS)` + `scoped(ctx, where)`. Policy/incident mutations also `requireRole(ctx, 'admin')`. `costBreakdown` maps `groupBy`→column and aggregates via a raw helper mirroring `getAgentWorkloadRaw`.

### REST
| Method · Path | Auth | Body | Response | Errors |
|---|---|---|---|---|
| `POST /api/cost-events` | `resolveAgent` + rate-limit | `{ agentId?, model?, provider?, taskId?, projectId?, billerId?, issueId?, tokensIn?, tokensOut?, amountCents: number, source?, idempotencyKey? }` | `200 { ok, id }` | 401/400/409 dup/500 |
| `GET /api/budgets` | session + member | — | `200 { policies }` | 401/403 |
| `POST /api/budgets` | session + admin | `{ scope, agentId?, name, limitCents, window, hardStop? }` | `201 { policy }` | 401/403/400/409 |
| `GET/PATCH/DELETE /api/budgets/[id]` | session (+admin for write) | patch fields | `200 { policy }` / `{ ok }` | 401/403/404/400 |

All REST gate on buildbase `budgets` feature (`_lib/with-feature.ts`), filter by `ctx.tenancy.workspaceId`. Heartbeat gains optional `costDelta?: { amountCents, model?, provider?, tokensIn?, tokensOut?, taskId?, projectId? }` → `recordCostEvent`.

## 7. File change list
**Create:** `packages/database/prisma/schema/finance.prisma`; `packages/database/src/finance/{create-cost-event,increment-quota-window,find-policies,incidents,cost-breakdown-raw,index}.ts` (+ re-export from `src/index.ts`); `apps/web/src/server/services/{budget-window,cost,budget-enforcement}.ts`; `apps/web/src/server/events/handlers/budget.ts`; `packages/graphql-server/src/types/{cost-event,budget-policy,quota-window,budget-incident}.ts`; `apps/web/src/server/graphql/{queries,mutations,subscriptions}/finance.ts`; `apps/web/app/api/cost-events/route.ts`; `apps/web/app/api/budgets/route.ts` + `[id]/route.ts`; `apps/web/app/(dashboard)/finance/page.tsx` + `settings/budgets/page.tsx`; agent detail spend widget/badge; `apps/mobile/.../finance.tsx`; all §9 tests.
**Modify:** `agent/task/project.prisma` back-relations; `packages/utils/src/feature-flag-keys.ts` (+`BUDGETS`); `packages/utils/src/domain-constants.ts` (+`COST_EVENT_RECORDED`/`BUDGET_INCIDENT_OPENED`/`_RESOLVED`); `events/types.ts` (union) + `events/index.ts` (register handler) + `handlers/notification.ts`; `events/ingest.ts` (heartbeat costDelta); `services/cloud-vm-cron.ts` (VM feed); `graphql/mutations/agents.ts` (`createAgent` plan-quota R11); `types/index.ts` (register); `cache.ts` (cost caches); `pubsub.ts` (+BUDGET.INCIDENT_CHANGED).

## 8. Implementation order
1. Schema + back-relations (R1,R3,R4,R6). 2. Migration + partial unique index + idempotent VM backfill (R13). 3. Constants/flags/event-union (R3,R5,R12). 4. DB modules (R1,R4,R6,R10). 5. `budget-window.ts` + unit tests (R4). 6. Services `cost.ts`/`budget-enforcement.ts` (R2,R4,R5,R6,R7,R8). 7. `handlers/budget.ts` + register + notifications (R5,R6,R7). 8. GraphQL types (R1,R3,R6). 9. Resolvers scoped+cached (R10,R14) + mutations gated (R3,R9) + subscription (R12). 10. REST (R2,R3). 11. Heartbeat costDelta + VM feed + `createAgent` plan quota (R2,R11). 12. UI (R7,R10,R12). 13. Tests red→green (§9).

## 9. Test cases (name · type · arrange · act · assert · path)
1. **windowBounds daily/monthly** · unit · fixed `now` · `windowBounds('daily'|'monthly', now, 'UTC')` · daily = UTC midnight→next; monthly = first→last of month · `tests/unit/budget-window.test.ts`.
2. **checkBreach at exactly limit** · unit · window `1000/1000`, hardStop=false, not breached · `checkBreach` · breach, marks breached, one incident, NO pause (spy) · `tests/unit/budget-enforcement.test.ts`.
3. **checkBreach below limit** · unit · `999/1000` · no breach/incident/pause · same file.
4. **checkBreach already breached idempotent** · unit · breached window + open incident · no 2nd incident · same file.
5. **recordCostEvent increments matching, skips non-matching** · unit · workspace + agentA + agentB policies · `recordCostEvent(agentId:A,500)` · ws +500, A +500, B untouched · `tests/unit/cost-record.test.ts`.
6. **ingestCostEvent persists + emits** · integration · seed ws, feature on · mutation · row + `COST_EVENT_RECORDED` (spy) · `tests/integration/finance.ingest.test.ts`.
7. **budget hard-stop pauses agent when window spend exceeds limitCents** · integration · agent + hardStop policy 1000 daily · ingest >1000 · `Agent.status=blocked`, one open incident `autoPaused=true`, `AGENT_STATUS_APPLIED` · `tests/integration/finance.hardstop.test.ts`.
8. **hardStop=false records but no pause** · integration · same file.
9. **workspace-scope hard-stop pauses all agents** · integration · 2 agents · both blocked · same file.
10. **QuotaWindow increment concurrency** · integration · N=20 concurrent `recordCostEvent(100)` · final `spendCents=2000`, single window row · `tests/integration/finance.concurrency.test.ts`.
11. **resolveBudgetIncident resolves, no unpause** · integration · incident + blocked agent · resolve · resolved fields set, agent still blocked · `tests/integration/finance.resolve.test.ts`.
12. **costBreakdown all dimensions** · integration · varied events · each `groupBy` sums correctly · `tests/integration/finance.breakdown.test.ts`.
13. **financeSummary totals** · integration · same file.
14. **requireFeature gate** · integration · budgets off · `budgetPolicies` throws `FEATURE_DISABLED` · `tests/integration/finance.gate.test.ts`.
15. **requireRole gate** · integration · member → `createBudgetPolicy` forbidden; admin ok · same file.
16. **cross-workspace isolation** · integration · ws A + B · queries/REST return only A · `tests/integration/finance.isolation.test.ts`.
17. **budgetIncidentChanged subscription** · integration · subscribe → ingest past hardStop → receive incident · `tests/integration/finance.subscription.test.ts`.
18. **agent-create plan quota** · integration · fake buildbase quota max 1, 1 existing · `createAgent` throws `PLAN_LIMIT_EXCEEDED` · `tests/integration/agent-create-quota.test.ts`.
19. **VM backfill/live feed idempotent** · integration · run backfill twice → one CostEvent per usage · `tests/integration/finance.vmfeed.test.ts`.
20. **e2e heartbeat→autopause** · e2e · admin sets daily hardStop → agent reports costDelta past limit → dashboard shows auto-paused · `tests/e2e/budget-autopause.spec.ts`.
21. **e2e resolve then reactivate** · e2e · from paused → resolve → reactivate → idle · `tests/e2e/budget-resolve.spec.ts`.

## 10. Definition of Done
- [ ] 4 tables migrate additively; partial unique index; VM backfill idempotent; lint green (R13,R3).
- [ ] Cost ingested via REST + heartbeat, both via `recordCostEvent` (R1,R2).
- [ ] Atomic increment; concurrency test green (R4→T5,T10).
- [ ] Async breach on bus; at/over limit → breached + one incident (R5,R6→T2,T4,T6).
- [ ] hardStop pauses correct agent(s); false never pauses; workspace-scope pauses all (R7,R8→T7,T8,T9).
- [ ] Resolve without unpause (R9→T11).
- [ ] costBreakdown all 6 dims + summary/trend cached (R10→T12,T13).
- [ ] All gated by buildbase `requireFeature(BUDGETS)`; admin mutations `requireRole`; no License (R3→T14,T15).
- [ ] Agent-create plan quota; only buildbase touchpoint (R11→T18).
- [ ] `budgetIncidentChanged` live (R12→T17).
- [ ] Cross-workspace isolation across reads + REST (R14→T16).
- [ ] UI dashboards + settings + badge + mobile, responsive/role-gated (R7,R10,R12→T20,T21).
- [ ] Unit+integration+e2e+concurrency green; CI green.

## 11. Risks & mitigations
- **QuotaWindow write race** → atomic `increment` in `$transaction` + upsert on `@@unique([policyId, windowStart])`; T10.
- **Duplicate ingestion → false breach/auto-pause** → `idempotencyKey` partial unique + open-incident guard before pause; T4,T19.
- **Client `amountCents` inaccuracy** → server-side price table recomputes from tokens+model.
- **Workspace hard-stop blast radius** → admin confirm + notification; bounded to active workspace agents.
- **TZ/DST window math** → `windowBounds` anchors to workspace tz (default UTC); lazy rollover (optional `cron/budget-rollover` guarded by `CRON_SECRET`).
- **Postgres NULL-distinct uniqueness gap** → explicit partial unique index for workspace-scope policies.
- **Rollback leaves agents blocked** → runbook reactivate; flag off first.
