# CONVENTIONS — Implementation Rules for Coding Agents (Codex)

> **Read this file FIRST, before any epic.** These are binding rules. The per-epic specs in this
> folder assume every rule here. If an epic spec and this file ever disagree, **stop and flag it** —
> do not guess. You (the implementing agent) must not invent architecture, rename decided entities,
> or skip tests. When a spec says "exact," treat it as a contract.

---

## 0. Non-negotiable architectural decisions (in force for every epic)

- **D1 — buildbase = humans only.** `@buildbase/sdk` is the system-of-record for **human** identity,
  workspaces, human roles, feature entitlement, and the customer's subscription/billing — in both the
  cloud tier (`serverUrl = api.console.buildbase.app`) and self-host tier (`serverUrl =
  http://bb-tenant-server:4101`, the 4-service starter stack). buildbase has **no concept of an AI
  agent.** Never model an agent as a buildbase user/member.
- **D2 — Two planes, one bridge.** SaaS plane (buildbase) and agent/domain plane (AgentCenter) are
  bridged **only** by `workspaceId` (+ `Profile(kind=human).buildbaseUserId`). Agents authenticate
  with `Agent.apiKeyHash` (`resolveAgent`) and **never call buildbase**. Do not add any
  agent→buildbase call.
- **D3 — Shared-workspace RBAC.** All humans in a workspace see all of that workspace's agents/
  projects/etc. buildbase role gates capability: `owner`/`admin` = manage, `member` = view-only.
  **No per-agent object-ACL** (no `Agent.visibility`, no access-grant tables) unless a future epic
  explicitly adds it. Gate the **mutation**, not the object.
- **D4 — What stays in AgentCenter.** Agent-domain governance (`Approval`, `AgentTrustProfile`),
  agent budgets (`CostEvent`/`BudgetPolicy`/auto-pause), and all agent lifecycle/config/adapters/
  secrets/tasks stay in AgentCenter Postgres, scoped by `workspaceId`. The custom `License` singleton
  and local `FeatureFlag` model are **retired** in favor of buildbase.
- **D5 — Workspace scoping.** Every domain root row carries `workspaceId String` (buildbase workspace
  `_id`; a string; **no Prisma FK**; always `@@index([workspaceId])`). Every list/read resolver calls
  `scoped(ctx, where)`; every mutation authorizes via `requireRole`/`requirePermission` on
  `ctx.tenancy`.

**Guardrail (applies everywhere): DO NOT** touch agent auth (`apiKeyHash`/`resolveAgent`), the
mc-bridge wire protocol, or existing agent lifecycle endpoints except to add `workspaceId` scoping.

---

## 1. Stack conventions (match existing code exactly)

| Concern | Rule | Reference |
|---|---|---|
| Prisma schema | Split files under `packages/database/prisma/schema/*.prisma`. `cuid()` ids, `@@map("snake_case")`, lowercase enum members, explicit `@@index`. | existing `*.prisma` |
| Prisma access | New data access as a module under `packages/database/src/<domain>/` (`create.ts`, `find-*.ts`, `index.ts`), re-exported from `packages/database/src/index.ts`. | `src/cloud-vm/` |
| GraphQL types | Pothos `builder.prismaObject(...)` in `packages/graphql-server/src/types/<name>.ts`; **register in `types/index.ts`**. | `types/cloud-vm.ts` |
| GraphQL ops | Queries/mutations/subscriptions in `apps/web/src/server/graphql/{queries,mutations,subscriptions}/<name>.ts` using `builder.queryField`/`mutationField`/`subscriptionField`. | `mutations/agents.ts` |
| Auth in resolvers | Human ops: `requireRole(ctx, 'admin')` / `requirePermission(ctx, 'x')` (buildbase-backed, epic #1). Agent ops: `resolveAgent(...)` (`apiKeyHash`). Feature gate: `requireFeature(ctx, slug)` (buildbase feature). | epic #1 |
| REST | Route handlers under `apps/web/app/api/**/route.ts`; use `_lib/json-response.ts` (`successResponse`/`errorResponse`/`handleError`), `_lib/validation.ts` (zod `validateBody`), `_lib/with-rate-limit.ts`, `_lib/resolve-agent.ts`/`resolve-session.ts`. | existing `app/api/*` |
| Events | Emit through `apps/web/src/server/events/bus.ts` (`emit`); add types to `events/types.ts` + `EventTypes` in `constants.ts`/`packages/utils/src/domain-constants.ts`; side-effects as `events/handlers/*`. | existing handlers |
| Realtime | `pubsub` (`apps/web/src/server/pubsub.ts`) + graphql-ws subscriptions. | `subscriptions/*` |
| Storage | Cloudflare R2 via `apps/web/src/server/storage/r2.ts` (`uploadFileToR2`, `generateDownloadUrl`, `deleteFile`). | existing |
| Crypto at rest | Reuse the AES-256-GCM envelope in `apps/web/src/server/services/ssh-keys.ts`; format `iv:authTag:ciphertext`. Secrets are **encrypted** (reversible), API keys are **SHA-256 hashed** (`api-key.ts`). Never confuse the two. | existing |
| Cron | New routes under `apps/web/app/api/cron/<name>/route.ts`, guarded by `env.CRON_SECRET` Bearer (pattern of `cron/auto-sleep`). | existing |
| Config/env | Add env vars to `apps/web/src/server/env.ts` with validation; required in prod, lenient in build. | existing |

**When a spec cites a file/function, verify it exists before using it.** If it doesn't, flag the spec
(a correctness bug) rather than inventing a substitute.

---

## 2. Migration rules (every schema change)

1. **Additive first.** New columns land **nullable / with defaults**. Never add a `NOT NULL` column
   without a default to a populated table in one step.
2. **Backfill** as a documented SQL/seed step (idempotent — safe to re-run).
3. **Tighten** to `NOT NULL` only in a **follow-up** migration, after verifying zero NULLs.
4. **Rollback** documented for every migration (`prisma migrate resolve --rolled-back` + drop order).
5. Must pass the repo's migration-safety lint. Runnable start-to-finish on a **seeded** DB.
6. `workspaceId` backfill (single-tenant install) → set all existing rows to the default workspace id.

---

## 3. Testing standard (Definition-of-Done requires all three where applicable)

- **Unit** — `apps/web/tests/unit/*`, `vitest.unit-no-db.config.ts`. Pure logic; no DB. Inject fakes
  (e.g. buildbase via the SDK `fetch` option). Every new service function gets unit tests.
- **Integration** — `vitest.config.ts`, real test DB. Every new resolver + migration behavior.
  **Cross-workspace isolation MUST be tested** for any workspace-scoped feature (seed 2 workspaces,
  assert no leakage).
- **E2E** — `apps/web/tests/e2e/*`. Every user-facing flow.
- **Concurrency** — any atomic/claim/lease feature MUST have a race test (e.g. two agents checkout the
  same task → exactly one wins).
- Each test case in a spec is written as: **name · type · arrange · act · assert · file path.** A
  coding agent implements exactly those; do not skip or rename them. Red→green before Done.

---

## 4. Security rules

- Secrets encrypted at rest (§1 crypto); **never** returned in plaintext via GraphQL/REST except an
  audited one-shot reveal to an authorized human, or the owning agent's runtime pull.
- All human mutations authorized via `ctx.tenancy` role/permission; all agent endpoints via
  `apiKeyHash`. No endpoint is unauthenticated except documented public webhooks (HMAC + rate-limit).
- No secret/token/PII in logs. Plugin/third-party code runs sandboxed (epic #6 rules).
- Workspace isolation is a security boundary: a query must never return another workspace's rows.

---

## 5. UI / UX rules (frontend work)

- Reuse the existing component system (shadcn under `apps/web/src/components/ui/shadcn`, Tailwind
  config, the status/priority token system). Do not introduce a second UI kit.
- Every new screen: responsive (mobile + desktop), keyboard-accessible, loading + empty + error
  states, and matches the existing dashboard shell. Gate nav/actions with buildbase role components
  (`<WhenWorkspaceRoles>`) + feature flags.
- Mobile (`apps/mobile`) parity for any feature the product exposes on mobile.
- Follow the design-system rules doc (to be added as `docs/gap-plans/DESIGN-SYSTEM.md`).

---

## 6. Git / PR rules

- One PR per epic phase (or per coherent sub-milestone); never mix epics.
- Branch off the default branch; conventional-commit messages.
- PR description: which epic + which requirements (by number) + which DoD items are green + migration
  notes + test evidence. CI green (typecheck, lint, unit, integration, e2e, migration-safety) required.

---

## 7. The per-epic spec template (every epic file conforms to this)

Every `NN-<name>.md` MUST contain these sections, in order. A coding agent should be able to
implement the epic from the file alone, with zero design decisions left open.

1. **Header** — epic id · phase · dependencies (hard preconditions) · decisions-in-force (restate D1–D5 as they apply).
2. **Requirements** — numbered `R1, R2, …`, each a testable "the system MUST …" statement.
3. **Non-goals / guardrails** — explicit "DO NOT …" list.
4. **Reuse map** — exact existing files/functions to use (path-precise).
5. **Data model** — exact Prisma (models/enums/indexes/relations).
6. **Migration** — exact commands + backfill SQL + rollback (per §2).
7. **API contracts** — exact GraphQL SDL (types, queries, mutations, subscriptions with arg + return
   shapes) and REST route signatures (method, path, request body, response body, auth, errors).
8. **File change list** — every file to **create** or **modify**, path-by-path, with a one-line "what
   goes here." This is the coding agent's checklist.
9. **Implementation order** — numbered steps (schema → migration → data access → resolvers → REST →
   UI → tests), each mapping to requirements.
10. **Test cases** — per §3 (name · type · arrange · act · assert · path), one per requirement min.
11. **Definition of Done** — a checklist that must be **100% green**; ties each item to a requirement.
12. **Risks** — and the mitigation baked into the plan.

> A spec missing any of these 12 sections is **not ready for implementation** — finish it first.

---

## 8. How a coding agent should execute an epic (process)

1. Read this file, then the epic file, then `DESIGN-SYSTEM.md` if the epic has UI.
2. Confirm all **dependencies** (prior epics' artifacts) exist in the codebase; if not, stop.
3. Implement in the **Implementation order**; after each step, run the tests for that step.
4. Do not proceed to the next requirement until the current one's tests are green.
5. When all **Definition of Done** items are green + CI passes, open the PR per §6.
6. If reality contradicts the spec (a cited file doesn't exist, a decision seems wrong), **stop and
   report** — never silently improvise architecture.
