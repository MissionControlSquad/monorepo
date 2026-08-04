# AgentCenter ← Paperclip — Integration Plans (index)

Codex-ready implementation specs — **one file per epic**. Read **`CONVENTIONS.md` first** (binding
rules + the 12-section spec template every epic follows). Every epic is a self-contained spec a coding
agent can implement with zero open design decisions.

Root gap inventory: [`../../GAP-ANALYSIS.md`](../../GAP-ANALYSIS.md).

## ⚑ Architectural decisions (binding — see `CONVENTIONS.md §0`)

- **D1** buildbase = **humans only** (identity, workspaces, human roles, feature entitlement, the
  customer's subscription/billing) — both tiers, differ only by `serverUrl`.
- **D2** Two planes bridged only by `workspaceId` (+ `Profile(kind=human).buildbaseUserId`). Agents
  use `apiKeyHash` and never call buildbase.
- **D3** Shared-workspace RBAC — all members see all agents; role gates view-vs-manage; no per-agent ACL.
- **D4** `License` singleton + local `FeatureFlag` retired → buildbase. Agent governance/budgets stay in AgentCenter.
- **D5** Every domain root has `workspaceId String` (no FK, indexed); gate via `ctx.tenancy`.

## Verification status (both audits complete)

- **Correctness audit:** fixes to apply during rewrite — stale `#1 (Organization/OrgRole)` headers →
  `#1 (buildbase tenancy)`; remove FK-to-`Organization` (#5/#7) → `workspaceId String`; drop human
  `PermissionGrant`/`authz.ts` (#3); replace License/FeatureFlag gating → buildbase feature slugs;
  fix backfills querying `organizations`/`org_memberships`; rename `orgId`→`workspaceId`; ref fixes
  (`deliverToLocalAgent`→`openclaw-local.ts`, use `resolveAgent`, `services/review.ts` `performApproveTask`).
- **Completeness audit:** 4 new epics added (#14–#17); the folds below close the remaining parity gaps.

## ⚠️ Implementation readiness (authoritative — read before giving anything to Codex)

Only hand a coding agent a spec marked **✅ READY**. Others will produce broken code.

- **✅ READY (12-section, audit-clean, enterprise techniques baked in):** **#1, #3, #4, #16.**
- **⛔ DRAFT — NOT implementation-ready:** **#2, #5, #7, #8.** These are pre-buildbase drafts that
  still carry the audit defects (stale `Organization`/`require-role.ts` deps, `License` gating,
  `orgId` columns; **#5 and #7 declare Prisma FKs to a deleted `Organization` model → they will not
  compile/migrate**). Must be upgraded to the 12-section template + audit fixes before use.
- **🆕 PENDING (not written):** **#6, #9, #10, #11, #12, #13, #14, #15, #17.**
- **Supporting docs in place:** `CONVENTIONS.md`, `DESIGN-SYSTEM.md`, and `.claude/skills/` (incl. the
  mandatory `production-implementation-loop` — the per-functionality design/UI/coding/test/build gate).

**Program status: 4 of 17 epics are implementation-ready (~25%).** The *method* (atomicity,
reuse-maps, pure/functional helpers with unit tests, workspace isolation, migration safety, full
requirement→test→DoD→why traceability) is fully established in `CONVENTIONS.md`, `.claude/skills/`, and
the 4 ready specs. The remaining 13 epics must be brought to that same bar before a full build.

## Build sequence — 17 epics (dependency-ordered)

| Phase | # | Epic | File | Status |
|---|---|---|---|---|
| 0 Foundation | 1 | Tenancy via buildbase (workspaces + human RBAC + billing) | `01-buildbase-tenancy.md` | ✅ drafted (template-upgrade) |
| 1 Control plane | 3 | Governance / Approvals (agent trust + Approvals) | `03-governance-approvals.md` | ⚠️ drafted (fix + upgrade) |
| 1 Control plane | 4 | Agent Budgets / Cost (agent spend + auto-pause) | `04-budgets-finance.md` | ⚠️ drafted (fix + upgrade) |
| 1 Control plane | 16 | **Finance ledger** (revenue + expenses) | `16-finance-ledger.md` | 🆕 pending |
| 2 Agent breadth | 2 | Multi-provider adapters **+ config revisions + AGENTS.md instructions** | `02-multi-provider-adapters.md` | ⚠️ drafted (fix + expand + upgrade) |
| 2 Agent breadth | 5 | Secrets **+ user-scoped secrets** | `05-secrets-management.md` | ⚠️ drafted (fix + expand + upgrade) |
| 3 Autonomy | 7 | Pipelines / Routines **+ routine docs, case outputs** | `07-pipelines-routines.md` | ⚠️ drafted (fix + upgrade) |
| 3 Autonomy | 8 | Task reliability **+ issue primitives (labels, read-states, typed relations, doc lock, thread interactions)** | `08-task-reliability.md` | ⚠️ drafted (fix + expand + upgrade) |
| 3 Autonomy | 17 | **Cases domain** (cases + docs/attachments/labels/events, case↔task links) | `17-cases.md` | 🆕 pending |
| 4 Depth | 9 | Execution workspaces / terminals **+ environments, custom images, leases, runtime services, cloud upstreams/sandbox providers** | `09-workspaces-terminals.md` | 🆕 pending (large) |
| 4 Depth | 10 | Skills catalog / studio **+ teams catalog (installable teams)** | `10-skills-studio.md` | 🆕 pending |
| 5 Ecosystem | 6 | Plugin SDK (11 models + sandbox + tools/jobs/webhooks/UI) | `06-plugin-sdk.md` | 🆕 pending (largest) |
| 5 Ecosystem | 12 | CLI (buildbase-auth device flow + GraphQL client) | `12-cli.md` | 🆕 pending |
| 6 Polish | 11 | Deliverables / Docs / Goals / annotations / external objects **+ assets, work timeline** | `11-docs-goals.md` | 🆕 pending |
| 6 Polish | 13 | Observability / run ledger / OpenAPI **+ feedback voting/export, agent org-chart (reports-to), sidebar/inbox** | `13-observability.md` | 🆕 pending |
| 6 Polish | 14 | **Workspace export / import** (portable bundle of agents/projects/config) | `14-workspace-portability.md` | 🆕 pending |
| 6 Polish | 15 | **Board / CEO chat console** (concierge agent, SSE, ops thread) | `15-board-chat.md` | 🆕 pending |

## Fold map (parity gaps → their epic)

- **#2** ← agent config-revision ledger + rollback (`agent_config_revisions`); agent instructions / AGENTS.md mgmt.
- **#3** ← approval subject breadth (`hire_agent`, issue-link).
- **#5** ← user-scoped secrets (`user_secret_declarations`/`definitions`).
- **#7** ← `routine_documents`, `pipeline-case-outputs`, `pipeline-conversation-context`.
- **#8** ← labels-as-entity, issue read-states, typed issue relations, document lock/unlock, issue thread interactions/handoffs.
- **#9** ← environments + custom Docker images + leases + setup sessions + runtime services + preview URLs + ops log + **cloud upstreams / pluggable sandbox providers (Cursor/e2b/Novita)**.
- **#10** ← teams catalog (installable teams + collision strategy + source-trust).
- **#11** ← assets management (`assets`), work timeline, productivity review.
- **#13** ← feedback/trace voting + export + redaction; agent org-chart (`Agent.managerId`, AgentCenter-domain); company search; sidebar prefs/badges; inbox archives; instance DB backups (ops).

## Documented intentional non-goals (Paperclip has, AgentCenter deliberately omits)

- **Per-object/per-agent ACL** — superseded by D3 shared-workspace (additive later if needed).
- **Local no-login single-user dev mode** (Paperclip `local_trusted`, `paperclipai run/onboard/env-lab`, embedded Postgres) — AgentCenter self-host uses the buildbase Auth Portal, so there is always a login. Confirmed dropped.
- **Human tenancy internals** (invites, join-requests, human RBAC store, company branding/search-as-owned-tables) — owned by buildbase, not rebuilt.

**Rule of thumb:** finish a phase (migrations + GraphQL + minimal UI + tests green per `CONVENTIONS.md`)
before the next. #1 lands first (establishes `ctx.tenancy` + `workspaceId`).
