# Epic #3 — Governance / Approvals (Agent Trust + Approvals)

**Phase:** 1 (Control plane) · **Gap:** 🔴 Large
**Dependencies:** **#1 (buildbase tenancy → `ctx.tenancy`, `workspaceId`, `requireRole`/`requirePermission`)**. Epic #1 MUST be merged first: it provides `ctx.tenancy`, the `requireRole(ctx, role)`/`requirePermission(ctx, permission)` guards, `scoped(ctx, where)`, buildbase-backed `requireFeature`, and the `workspaceId String` column on every domain root (including `Agent`). Builds on the existing task-review surface (`apps/web/src/server/services/review.ts` + `apps/web/src/server/graphql/mutations/reviews.ts`) and the event bus.

> **⚑ Decisions-in-force:**
> - **D1 — buildbase = humans only.** Human RBAC ("which human may approve/manage governance") is buildbase roles via `ctx.tenancy`. This epic does **NOT** model human permissions — there is **no `PermissionGrant` model** and **no `authz.ts` human-permission engine** (deleted per audit).
> - **D2 — Two planes.** Agents authenticate via `apiKeyHash` (`resolveAgent`) and never call buildbase. Governance rows bridge to the SaaS plane only through `workspaceId`.
> - **D3 — Shared-workspace RBAC.** All humans in a workspace see all governance rows. Role gates the mutation (`admin` = decide/manage, `member` = view). No per-object ACL.
> - **D4 — Stays in AgentCenter.** `Approval`, `ApprovalComment`, `AgentTrustProfile` live in AgentCenter Postgres, scoped by `workspaceId`. `License` is not used; feature entitlement flows through buildbase via `requireFeature(FLAG_KEYS.GOVERNANCE)`.
> - **D5 — Workspace scoping.** Every governance root carries `workspaceId String` (no FK; `@@index`). Reads via `scoped(ctx, where)`; human mutations via `requireRole`/`requirePermission`.
>
> **Correctness note:** The existing `approveTask`/`rejectTask`/`requestClarification` GraphQL mutations authorize by **agent** role (`reviewer.role === Roles.SQUAD_LEAD`) and delegate to `performApproveTask`/`performRejectTask`/`performRequestClarification`. That **agent auto-review path is left untouched.** New human-facing `Approval` decisions authorize by **buildbase role** (`requireRole(ctx, 'admin')`) and delegate to the *same* `performApproveTask`/`performRejectTask` — one task-transition state machine, no parallel status logic.

---

## Target model
```
buildbase workspace ─ workspaceId (string, no FK) ─┐
Approval (workspace-scoped governance object)  ◄────┘
├── subjectType ∈ {task, deliverable, hire_agent}   (polymorphic, no cross-model FK)
├── subjectId  = Task.id | Deliverable.id | agent-spec id
├── taskId?    → Task            (explicit approval↔task link; decide() transitions it)
├── requestedBy → Profile        (human or agent profile that raised it)
├── decidedBy?  → Profile
└── comments  → ApprovalComment[]
Agent
├── trustLevel: TrustLevel?          (denormalized cache on the hot Agent row)
└── trustProfile → AgentTrustProfile (1:1 side-table)
```

## 1. Requirements
- **R1 — Approval entity.** Persist a workspace-scoped `Approval`: `subjectType ∈ {task, deliverable, hire_agent}` + `subjectId`, optional `taskId` link, `status ∈ {pending, approved, rejected, needs_changes, cancelled}` (default pending), `title`, `reason?`, `requestedById`, `decidedById?`, `decidedAt?`, `decisionNote?`, `resubmitCount` (default 0).
- **R2 — Create (human + agent).** A human (GraphQL `createApproval`) or agent (REST `POST /api/approvals`) creates an `Approval` in **their own workspace**. GraphQL: `requireFeature(GOVERNANCE)` + `requireRole(ctx,'member')`. REST: `resolveAgent` + feature check. `workspaceId` from `ctx.tenancy`/resolved agent, never client input.
- **R3 — Decide → reuse the real task transition.** When approved with `subjectType=task` (or non-null `taskId`), call `performApproveTask(...)`; when rejected, `performRejectTask(...)` (`services/review.ts`). Human decisions authorize via `requireRole(ctx,'admin')`, not agent role. `deliverable`/`hire_agent` subjects change only `Approval.status`.
- **R4 — Resubmit & cancel.** `resubmitApproval` increments `resubmitCount`, resets to `pending`, clears decision fields. `cancelApproval` sets `cancelled`. Both error on a forbidden terminal transition.
- **R5 — Comment threads.** `ApprovalComment` (author `Profile`, `body`, `createdAt`) attached to an `Approval`, ordered, addable via `addApprovalComment`.
- **R6 — Agent trust profile.** 1:1 `AgentTrustProfile` per `Agent` (`trustLevel` default standard, `lowTrustContainment`, `requireUntrustedPrReview`, `autoPromoteWorkProduct` default true, `sourceTrustBadge?`, `changeConsentRequired`, `executionAllowlist String[]`), settable by admin via `setAgentTrustProfile`; write also updates denormalized `Agent.trustLevel` in the same transaction.
- **R7 — Trust enforcement.** `isActionAllowed(agentId, action, kind)` denies when: `changeConsentRequired` and `action` not in `executionAllowlist`; `lowTrustContainment` and `kind='host_write'`; `requireUntrustedPrReview` and `kind='pr_merge'` while `trustLevel='untrusted'`. Agents query it via REST `POST /api/agent-trust/check`.
- **R8 — Events & notifications.** Create/decide/comment emit `APPROVAL_REQUESTED`/`APPROVAL_DECIDED`/`APPROVAL_COMMENTED`; new `events/handlers/approval.ts` fans out human notifications.
- **R9 — Live updates.** `approvalChanged` subscription (filterable by `subjectId`) via `pubsub` on every create/decide/comment/cancel/resubmit.
- **R10 — Feature gating.** Every resolver/route calls `requireFeature(FLAG_KEYS.GOVERNANCE)`. `License.features` MUST NOT gate this epic. Add `GOVERNANCE: "governance"` (default false).
- **R11 — Cross-workspace isolation.** Every read `scoped(ctx, where)`; a workspace-A human MUST NOT read/decide/comment/cancel a workspace-B approval.
- **R12 — Headless agent REST.** `POST /api/approvals`, `GET /api/approvals`, `GET /api/approvals/[id]`, `POST /api/agent-trust/check` (via `resolveAgent`), each scoped to the resolving agent's `workspaceId`.

## 2. Non-goals / guardrails (DO NOT)
- **DO NOT** create a `PermissionGrant` model, `PrincipalKind`/`PermissionEffect` enums, an `authz.ts` engine, `grantPermission`/`revokePermission`/`effectivePermissions`, a `permission-grant.ts` type, or `/api/authz/check`. Human authorization is buildbase-only.
- **DO NOT** query `organizations`/`org_memberships` in migration/backfill. The only backfill is a default `AgentTrustProfile` per agent.
- **DO NOT** add `orgId`/`organizationId`/`Organization` relations. Use `workspaceId String` (indexed, no FK).
- **DO NOT** gate on `License.features`. Gate only via `requireFeature(FLAG_KEYS.GOVERNANCE)`.
- **DO NOT** change the existing `approveTask`/`rejectTask`/`requestClarification` mutations or their `SQUAD_LEAD` agent authorization — the agent auto-review path stays as-is.
- **DO NOT** fork the task status machine — human decisions delegate to `performApproveTask`/`performRejectTask`.
- **DO NOT** touch agent auth, the mc-bridge wire protocol, or agent lifecycle beyond reading `workspaceId`.
- **DO NOT** add per-agent object ACLs (D3). **DO NOT** accept `workspaceId` from client input.

## 3. Reuse map (path-precise)
| Need | Reuse |
|---|---|
| Task approve/reject transition | `performApproveTask`, `performRejectTask` in `apps/web/src/server/services/review.ts` (used by `mutations/reviews.ts` + `app/api/tasks/[id]/approve/route.ts`). |
| `ReviewerInfo` for the human reviewer | `ReviewerInfo { id; name; username? }` in `services/review.ts`; build via `getOrCreateAgentProfileId` (`apps/web/src/server/agent-profile.ts`). |
| Human authz / scoping / feature | `requireRole`/`requirePermission`/`scoped` (Epic #1); `requireFeature` (`graphql/require-feature.ts`); `FLAG_KEYS` (`packages/utils/src/feature-flag-keys.ts`). |
| Agent REST auth | `resolveAgent` (`apps/web/app/api/_lib/resolve-agent.ts`). |
| REST helpers | `successResponse`/`errorResponse`/`handleError`/`assertFound` (`_lib/json-response.ts`); `validateBody`+zod (`_lib/validation.ts`); `withRateLimit` (`_lib/with-rate-limit.ts`); `RouteContext` (`_lib/route-context.ts`). |
| Events | `emit` (`events/bus.ts`); union `events/types.ts`; `EventTypes` (`domain-constants.ts`); register in `events/index.ts`; notify via `handlers/notification.ts`+`handlers/user-notification.ts`. |
| Realtime | `pubsub` (`apps/web/src/server/pubsub.ts`); subscription pattern `graphql/subscriptions/*`. |
| GraphQL types + registration | `builder.prismaObject` (`types/cloud-vm.ts`); register in `types/index.ts`. |
| Op modules | `builder.queryField`/`mutationField` (`mutations/reviews.ts`). |
| Data access | module-per-domain (`packages/database/src/cloud-vm/`), re-export from `src/index.ts`. |
| Trust side-table precedent | 1:1 side-tables off `Agent` (`WorkSession`, `StatusHistory`). |

**No human-permission engine exists or is created — that concern is buildbase's.**

## 4. Data model — `packages/database/prisma/schema/governance.prisma`
```prisma
enum ApprovalStatus { pending approved rejected needs_changes cancelled }
enum ApprovalSubjectType { task deliverable hire_agent }
enum TrustLevel { untrusted low standard trusted }

model Approval {
  id            String              @id @default(cuid())
  workspaceId   String                                  // buildbase workspace _id; no FK
  subjectType   ApprovalSubjectType
  subjectId     String                                  // polymorphic, no FK
  taskId        String?
  status        ApprovalStatus      @default(pending)
  title         String
  reason        String?
  requestedById String
  decidedById   String?
  decidedAt     DateTime?
  decisionNote  String?
  resubmitCount Int                 @default(0)
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  requestedBy Profile           @relation("ApprovalRequestedBy", fields: [requestedById], references: [id], onDelete: Cascade)
  decidedBy   Profile?          @relation("ApprovalDecidedBy",  fields: [decidedById],  references: [id], onDelete: SetNull)
  task        Task?             @relation("ApprovalTask",        fields: [taskId],       references: [id], onDelete: SetNull)
  comments    ApprovalComment[]

  @@index([workspaceId, status])
  @@index([subjectType, subjectId])
  @@index([taskId])
  @@index([requestedById])
  @@index([status, createdAt])
  @@map("approvals")
}

model ApprovalComment {
  id              String   @id @default(cuid())
  workspaceId     String                                 // denormalized for isolation queries; no FK
  approvalId      String
  authorProfileId String
  body            String
  createdAt       DateTime @default(now())

  approval Approval @relation(fields: [approvalId], references: [id], onDelete: Cascade)
  author   Profile  @relation("ApprovalCommentAuthor", fields: [authorProfileId], references: [id], onDelete: Cascade)

  @@index([approvalId, createdAt])
  @@index([workspaceId])
  @@map("approval_comments")
}

model AgentTrustProfile {
  agentId                  String     @id                // 1:1 with Agent
  workspaceId              String                        // no FK
  trustLevel               TrustLevel @default(standard)
  lowTrustContainment      Boolean    @default(false)
  requireUntrustedPrReview Boolean    @default(false)
  autoPromoteWorkProduct   Boolean    @default(true)
  sourceTrustBadge         String?
  changeConsentRequired    Boolean    @default(false)
  executionAllowlist       String[]   @default([])
  updatedAt                DateTime   @updatedAt

  agent Agent @relation(fields: [agentId], references: [id], onDelete: Cascade)

  @@index([workspaceId, trustLevel])
  @@map("agent_trust_profiles")
}
```
Edit `agent.prisma` → `Agent` (additive): `trustLevel TrustLevel?` + `trustProfile AgentTrustProfile?`.
Edit `user.prisma` → `Profile` (back-relations): `approvalsRequested`/`approvalsDecided`/`approvalComments`.
Edit `task.prisma` → `Task`: `approvals Approval[] @relation("ApprovalTask")`.
`Agent.trustLevel` nullable/additive; all `AgentTrustProfile` NOT NULL cols have defaults — no nullable→NOT NULL follow-up.

## 5. Migration
```bash
cd packages/database
pnpm prisma migrate dev --name add_governance_approvals --create-only
```
Append idempotent backfill to the generated `migration.sql` (no `organizations`/`org_memberships`):
```sql
INSERT INTO "agent_trust_profiles" ("agentId","workspaceId","trustLevel","updatedAt")
SELECT a."id", a."workspaceId", 'standard', now() FROM "agents" a
ON CONFLICT ("agentId") DO NOTHING;
UPDATE "agents" a SET "trustLevel" = t."trustLevel"
FROM "agent_trust_profiles" t WHERE t."agentId" = a."id";
```
```bash
pnpm prisma migrate dev        # prod: pnpm prisma migrate deploy
pnpm prisma generate
```
**Rollback:** (1) `governance` feature off; (2) `prisma migrate resolve --rolled-back`; (3) `DROP TABLE approval_comments; DROP TABLE approvals; DROP TABLE agent_trust_profiles; ALTER TABLE agents DROP COLUMN trustLevel; DROP TYPE ApprovalStatus; DROP TYPE ApprovalSubjectType; DROP TYPE TrustLevel;`. Passes migration-safety lint; runs on seeded DB; backfill re-runnable.

## 6. API contracts
### GraphQL SDL
```graphql
enum ApprovalStatus { pending approved rejected needs_changes cancelled }
enum ApprovalSubjectType { task deliverable hire_agent }
enum TrustLevel { untrusted low standard trusted }

type Approval { id: ID!  workspaceId: String!  subjectType: ApprovalSubjectType!  subjectId: String!  taskId: String  status: ApprovalStatus!  title: String!  reason: String  requestedBy: Profile!  decidedBy: Profile  decidedAt: DateTime  decisionNote: String  resubmitCount: Int!  task: Task  deliverable: Deliverable  comments: [ApprovalComment!]!  createdAt: DateTime!  updatedAt: DateTime! }
type ApprovalComment { id: ID!  approvalId: String!  author: Profile!  body: String!  createdAt: DateTime! }
type AgentTrustProfile { agentId: ID!  workspaceId: String!  trustLevel: TrustLevel!  lowTrustContainment: Boolean!  requireUntrustedPrReview: Boolean!  autoPromoteWorkProduct: Boolean!  sourceTrustBadge: String  changeConsentRequired: Boolean!  executionAllowlist: [String!]!  updatedAt: DateTime! }

extend type Query {
  approvals(status: ApprovalStatus, subjectType: ApprovalSubjectType): [Approval!]!
  approval(id: ID!): Approval
  pendingApprovalsForMe: [Approval!]!
  agentTrustProfile(agentId: ID!): AgentTrustProfile
}
extend type Mutation {
  createApproval(subjectType: ApprovalSubjectType!, subjectId: String!, taskId: String, title: String!, reason: String): Approval!   # requireRole(member)
  approveApproval(id: ID!, decisionNote: String): Approval!   # requireRole(admin) → performApproveTask
  rejectApproval(id: ID!, decisionNote: String): Approval!    # requireRole(admin) → performRejectTask
  resubmitApproval(id: ID!): Approval!                        # requester or admin
  cancelApproval(id: ID!): Approval!
  addApprovalComment(approvalId: ID!, body: String!): ApprovalComment!
  setAgentTrustProfile(agentId: ID!, trustLevel: TrustLevel, lowTrustContainment: Boolean, requireUntrustedPrReview: Boolean, autoPromoteWorkProduct: Boolean, sourceTrustBadge: String, changeConsentRequired: Boolean, executionAllowlist: [String!]): AgentTrustProfile!   # requireRole(admin)
}
extend type Subscription { approvalChanged(subjectId: String): Approval! }   # scoped to caller's workspace
```
All resolvers: `requireFeature(FLAG_KEYS.GOVERNANCE)` → stated `requireRole` → `scoped(ctx, where)`. Mutations `emit(...)` + `pubsub.publish(...)`.

### REST (all `Bearer mc_` → `resolveAgent`; `workspaceId` from resolved agent; feature-gated; rate-limited)
| Method · Path | Body | Response | Errors |
|---|---|---|---|
| `POST /api/approvals` | `{ subjectType, subjectId, taskId?, title, reason? }` | `{ approval:{ id,status,subjectType,subjectId,taskId,title,createdAt } }` | 400/401/403/429 |
| `GET /api/approvals?status=pending` | — | `{ approvals }` (workspace-scoped) | 401/403 |
| `GET /api/approvals/[id]` | — | `{ approval }` | 401/403/404 (foreign id → 404, not 403) |
| `POST /api/agent-trust/check` | `{ action, kind: "host_write"|"pr_merge"|"command" }` | `{ allowed, reason }` | 400/401/403 |
REST is create/read + trust-check only; human decisions are GraphQL/dashboard. Foreign ids → 404 (avoid existence leakage).

## 7. File change list
**Create:** `packages/database/prisma/schema/governance.prisma`; migration SQL; `packages/database/src/governance/{create-approval,find-approvals,update-approval,approval-comments,trust-profile,index}.ts` (+ re-export `src/index.ts`); `packages/graphql-server/src/types/{approval,approval-comment,agent-trust}.ts`; `apps/web/src/server/services/{approvals,trust}.ts`; `apps/web/src/server/graphql/queries/approvals.ts` + `mutations/approvals.ts` + `subscriptions/approvalChanged.ts`; `apps/web/src/server/events/handlers/approval.ts`; `apps/web/app/api/approvals/route.ts` + `[id]/route.ts` + `apps/web/app/api/agent-trust/check/route.ts`; `apps/web/app/(dashboard)/approvals/page.tsx` + `settings/trust/page.tsx`; `apps/mobile/app/approvals.tsx`; §9 tests.
**Modify:** `agent.prisma`/`user.prisma`/`task.prisma` (relations); `feature-flag-keys.ts` (+`GOVERNANCE`); `domain-constants.ts` (+`APPROVAL_REQUESTED/DECIDED/COMMENTED`); `events/types.ts` (union) + `events/index.ts` (register handler); `types/index.ts` (register 3 types); `_lib/validation.ts` (zod schemas); GraphQL root op registration.

## 8. Implementation order
1. Schema + edits (R1,R6). 2. Migration + backfill (R1,R6). 3. Flags + event constants + union (R8,R10). 4. Data access `governance/*` (R1,R5,R6). 5. Services `trust.ts` then `approvals.ts` (delegate to review) (R3,R4,R6,R7). 6. `handlers/approval.ts` + register (R8). 7. GraphQL types + register (R1,R5,R6). 8. Queries+mutations+subscription, each `requireFeature`→`requireRole`→`scoped` (R2-R6,R9,R10,R11). 9. REST + zod (R2,R7,R12). 10. UI approvals inbox + trust settings + mobile (R2,R3,R5,R6). 11. Tests red→green.

## 9. Test cases (name · type · arrange · act · assert · path)
- **T1 trust change-consent blocks non-allowlisted** · unit · profile `{changeConsentRequired:true,allowlist:["read"]}` · `isActionAllowed("a1","deploy","command")` · `{allowed:false}` · `tests/unit/trust.test.ts` (R7).
- **T2 allowlisted allowed** · unit · `isActionAllowed("a1","read","command")` → `allowed:true` · same file (R7).
- **T3 containment/pr-review** · unit · `{lowTrustContainment:true,requireUntrustedPrReview:true,trustLevel:untrusted}` · check host_write + pr_merge · both denied, distinct reasons · same file (R7).
- **T4 resubmit resets** · unit · approval `{status:rejected,resubmitCount:1}` · `resubmitApproval` · `resubmitCount:2, status:pending`, decision fields cleared · `tests/unit/approvals.test.ts` (R4).
- **T5 decide delegates** · unit · spy `performApproveTask`; approval `{subjectType:task,taskId:t1}` · `decideApproval("approve")` · called once with t1; deliverable/hire_agent don't call · same file (R3).
- **T6 create persists + emits** · integration · W1 admin; bus spy · `createApproval(task,t1,t1)` · row `workspaceId=W1,status=pending`; `APPROVAL_REQUESTED` · `tests/integration/approvals.create.test.ts` (R1,R2,R8).
- **T7 approve transitions task** · integration · task in review, pending approval, admin · `approveApproval` · `Task.status=done`, approval approved, decided fields set · `tests/integration/approvals.decide.test.ts` (R3).
- **T8 reject moves task back** · integration · `rejectApproval(id,note)` · `Task.status=assigned`, rejected, note stored · same file (R3).
- **T9 member cannot approve** · integration · member ctx · `approveApproval` → FORBIDDEN; task unchanged · `tests/integration/approvals.authz.test.ts` (R3).
- **T10 comment thread + pubsub** · integration · pubsub spy · `addApprovalComment` · persisted+ordered; `approvalChanged` published · `tests/integration/approvals.comment.test.ts` (R5,R9).
- **T11 setAgentTrustProfile updates cache** · integration · admin · `setAgentTrustProfile(a,trusted,["deploy"])` · profile updated AND `Agent.trustLevel=trusted` · `tests/integration/trust.profile.test.ts` (R6).
- **T12 feature gate** · integration · governance off · `createApproval` → `FEATURE_DISABLED` · `tests/integration/approvals.feature-gate.test.ts` (R10).
- **T13 isolation read** · integration · W1+W2 approvals; ctx W2 · list only W2; `approval(W1id)` null · `tests/integration/approvals.isolation.test.ts` (R11).
- **T14 isolation decide denied** · integration · W1 pending; admin ctx W2 · `approveApproval(W1id)` → not-found; W1 + task unchanged · same file (R11).
- **T15 REST create scopes to agent workspace** · integration · agent A in W1 · `POST /api/approvals{hire_agent,...}` · 201; `workspaceId=W1` · `tests/integration/approvals.rest.test.ts` (R1,R12).
- **T16 REST GET cross-workspace → 404** · integration · W1 approval; agent B in W2 · `GET /api/approvals/{W1id}` → 404 · same file (R11,R12).
- **T17 REST trust-check** · integration · profile allowlist `["read"]` · check deploy then read · false then true · `tests/integration/trust.check.rest.test.ts` (R7,R12).
- **T18 migration backfill idempotent** · integration · 2 agents, run backfill twice · one profile per agent; `agents.trustLevel` populated · `tests/integration/governance.migration.test.ts` (R6).
- **T19 subscription on decision** · integration · subscribe `approvalChanged(t1)` · `approveApproval` · subscriber receives updated approval · `tests/integration/approvals.subscription.test.ts` (R9).
- **T20 e2e agent→admin approve→task done** · e2e · agent posts approval; admin approves in inbox · task done, approved, thread visible · `tests/e2e/approvals.flow.spec.ts` (R2,R3,R5,R9).
- **T21 e2e hire_agent gate** · e2e · agent posts hire_agent approval; admin approves · approved (no task transition), event/notification · `tests/e2e/approvals.hire-agent.spec.ts` (R1,R8).

## 10. Definition of Done
- [ ] R1 `Approval` migrates with 3 subject types + `taskId` link (T6,T15,T18).
- [ ] R2 humans+agents create scoped; `workspaceId` never client-supplied (T6,T15).
- [ ] R3 human approve/reject delegates to `performApproveTask`/`performRejectTask` via `requireRole('admin')`; agent path untouched (T5,T7,T8,T9).
- [ ] R4 resubmit/cancel transitions (T4).
- [ ] R5 comment threads add/read/publish (T10,T20).
- [ ] R6 `AgentTrustProfile` CRUD updates cache; backfill seeds defaults (T11,T18).
- [ ] R7 `isActionAllowed` enforces allowlist/containment/pr-review (T1,T2,T3,T17).
- [ ] R8 approval events emitted + notified (T6,T21).
- [ ] R9 `approvalChanged` live (T10,T19,T20).
- [ ] R10 gated by `requireFeature(GOVERNANCE)`; no License (T12).
- [ ] R11 scoped reads; cross-workspace read/decide/REST denied (T13,T14,T16).
- [ ] R12 agent REST create/list/read + trust-check (T15,T16,T17).
- [ ] No `PermissionGrant`/`authz.ts`/human-permission engine exists.
- [ ] Migration lint green, seeded-DB run, rollback documented; CI green.

## 11. Risks
- **Polymorphic `subjectId` orphan risk** → explicit `taskId` FK SetNull for the common case; deliverable/hire_agent validated at create + periodic reconciliation; comments cascade.
- **Regressing live approve/reject** → human decisions call existing `performApproveTask`/`performRejectTask` unchanged; agent `approveTask`+`SQUAD_LEAD` guard untouched; T7/T8 assert transitions still fire.
- **Cross-workspace leakage** → `scoped` mandatory; REST derives workspace from resolved agent + returns 404 for foreign ids; T13/T14/T16.
- **Denormalized `trustLevel` drift** → `setTrustProfile` writes both in one transaction; T11.
- **License/flag confusion** → only `requireFeature(GOVERNANCE)`; T12.
- **Admin lockout** → trust profiles constrain agents only; human authority is buildbase role, so a bad trust profile can't lock out a human admin.
