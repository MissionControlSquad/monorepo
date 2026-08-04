# AgentCenter ← Paperclip — Feature Gap Analysis & Implementation Roadmap

> **Purpose:** Bring AgentCenter to feature parity with (and beyond) Paperclip — the
> open-source "control plane for AI-agent companies." This document enumerates every
> gap, orders the work by dependency + codebase-quality impact, and holds the
> per-epic implementation plans.
>
> **Source of truth:** the two codebases as of 2026-07. Paperclip
> (`../paperclip`, MIT, Express + Drizzle + React/Vite, ~99 tables, ~168 services,
> ~250-command CLI) vs AgentCenter (this repo, proprietary, Next.js + Prisma +
> Pothos/Yoga GraphQL + Redis, ~50 models, web + Electron + Expo).

---

## ⚑ Architectural decision (2026-07): tenancy via buildbase

**AgentCenter adopts `@buildbase/sdk` as the system-of-record for tenancy, auth, RBAC, feature
flags, subscriptions/quotas, and notifications — in both tiers.** Cloud → managed
`api.console.buildbase.app`; self-host → the 4-service
[`buildbase-app/self-hosted-starter`](https://github.com/buildbase-app/self-hosted-starter) Docker
stack on the client VPS (app data stays local; only a licensing heartbeat phones home). Same code
both tiers — only `serverUrl` differs.

This **supersedes the original epic #1** (hand-built Org/Team/Roles) and reshapes #3/#4:
- Domain data stays in Postgres, **keyed by `workspaceId`** (buildbase workspace `_id`).
- Authz = `requireRole`/`requirePermission` reading `ctx.tenancy` (buildbase `permissions.resolve`).
- The custom `License` singleton + local `FeatureFlag` are **retired** for buildbase Installation
  licensing + Feature Flags + Subscriptions.

Detailed per-epic plans now live in [`docs/gap-plans/`](./docs/gap-plans/). The sections below are the
gap inventory; where they say "org / `organizationId`" read "**`workspaceId`**", and where they say
"`require-role.ts`" read "**buildbase RBAC via `ctx.tenancy`**".

---

## Legend

- ✅ **Parity** — AgentCenter already covers this (sometimes better).
- 🟡 **Partial** — exists but shallower than Paperclip.
- ❌ **Missing** — no model/endpoint/UI today.

## Where AgentCenter already LEADS (do not regress)

- Native **mobile** (Expo/React Native, ~33 screens) and **desktop** (Electron) clients — Paperclip has neither shipped.
- **Multi-channel notifications**: in-app + Web Push + email, per-type preferences, quiet hours.
- **Licensing / entitlement** (`License`, feature flags, seat/quota limits).
- **Agent template catalog**: 174 templates / 14 categories (vs Paperclip's smaller set).
- **GraphQL subscriptions** (urql + graphql-ws) for real-time — cleaner than Paperclip's ad-hoc WS.

---

## Scorecard

| # | Domain | AgentCenter today | Gap |
|---|--------|-------------------|-----|
| 1 | ~~Org / Companies / Teams / Roles~~ → **Tenancy via buildbase** | Projects only, single `AdminUser` | ✅ **Solved by buildbase** (see [`01-buildbase-tenancy.md`](./docs/gap-plans/01-buildbase-tenancy.md)) |
| 2 | Multi-provider agent adapters | OpenClaw-only (`mc-bridge-plugin`) | 🔴 Large |
| 3 | Governance / Approvals / Permissions | Lead-review only | 🔴 Large |
| 4 | Budgets / Cost / Finance | Cloud-VM cost only | 🔴 Large |
| 5 | Secrets management | None | 🔴 Large |
| 6 | Plugins / Extensibility | First-party bridge only | 🔴 Large |
| 7 | Pipelines / Routines | Recurring tasks only | 🟠 Medium |
| 8 | Task reliability (watchdogs / recovery) | Basic lifecycle | 🟠 Medium |
| 9 | Environments / Workspaces / Terminals | Cloud VMs (strong) | 🟠 Medium |
| 10 | Skills catalog / studio | Templates (strong) | 🟠 Medium |
| 11 | Deliverables / Docs / Goals | Versioning + project docs | 🟡 Small |
| 12 | CLI | None | 🟠 Medium |
| 13 | Observability / Analytics | Strong | 🟢 Near parity |

---

## Dependency-ordered build sequence

Ordered by **what unblocks the most downstream work** and **what is painful to retrofit later** (schema-level foundations first), not by raw value. Each phase should ship migrations + GraphQL + minimal UI before the next begins.

```
Phase 0  Foundation      → #1 Tenancy via buildbase (workspaces + RBAC + flags + billing)
Phase 1  Control plane   → #3 Governance/Approvals   +  #4 Budgets/Finance
Phase 2  Agent breadth   → #2 Multi-provider adapters +  #5 Secrets
Phase 3  Autonomy        → #7 Pipelines/Routines      +  #8 Task reliability
Phase 4  Depth           → #9 Workspaces/Terminals    +  #10 Skills studio
Phase 5  Ecosystem       → #6 Plugin SDK              +  #12 CLI
Phase 6  Polish          → #11 Docs/Goals/annotations +  #13 Observability
```

**Why this order**

- **#1 must be first.** Budgets, secrets, governance, and permissions all reference a
  tenancy boundary + role model. AgentCenter's top container today is `Project` with a
  single `AdminUser`; #1 now **integrates buildbase** to provide workspaces + RBAC + billing,
  and adds `workspaceId` scoping to every domain root. Doing it first means every later epic
  gates via `ctx.tenancy` and scopes by `workspaceId` from day one — no re-migration.
- **#3 + #4 next** — they are the actual "control plane" value proposition and both hang
  directly off #1's org + role model.
- **#2 + #5** unlock non-OpenClaw agents (adapters need per-agent secret bindings, so #5
  pairs with #2).
- **#6 (plugins) is the largest single effort** and should land only once the core data
  model is stable, so plugin authors build against a settled schema.

---

## Per-epic implementation plans

> Filled in one at a time as we execute. Each plan targets this stack:
> Prisma schema (`packages/database/prisma/schema/*.prisma`, 15-file split) →
> Pothos GraphQL types (`packages/graphql-server/src/types/*`) →
> REST where agents need it (`apps/web/app/api/*`) →
> web UI (`apps/web/app/(dashboard)/*`) + mobile (`apps/mobile/app/*`).

### Phase 0 — #1 Org / Company / Team / Roles

_Full plan: `## Plan: #1 — Org / Team / Roles foundation` below._

---

## Plan: #1 — Org / Team / Roles foundation

**Tenancy decision:** Single-org + Teams (keep AgentCenter single-tenant per VPS/license).
Introduce ONE explicit `Organization` (bootstrapped from `License.org`); all existing
`Project`s attach to it. Add roles to membership, an optional `Team` grouping over
Projects, and an agent reporting hierarchy for the org chart. **`Project` stays the
operational boundary** — no tenant-scoping of every FK, no licensing rework. Multi-org
remains possible later (the `organizationId` columns are already there) but is not forced.

### Current state (confirmed)
- `Project` = top-level boundary; work (tasks/channels/docs/deliverables/activities) scopes to it.
- `ProjectMember` = `Profile` ↔ `Project`, **status only, no role**.
- `Profile` = unified human/agent identity; human `Profile` → `User`; single `AdminUser` login.
- No entity above `Project`; the "org" is the singleton `License` + `SystemSettings`.

### Target model

```
Organization (singleton today; from License.org)
 ├─ OrgMembership (Profile ↔ Org, role: owner/admin/member/viewer)   ← RBAC root
 ├─ Team (optional grouping)
 │   └─ TeamMembership (Profile ↔ Team, role: lead/member)
 ├─ Project (gains organizationId + optional teamId)
 │   └─ ProjectMember (gains role: manager/contributor/viewer)
 ├─ Invite (token → onboarding, role-scoped)
 └─ JoinRequest (request → approval queue)

Agent gains managerId (self-relation)  → org chart / reports-to
```

### Schema changes — `packages/database/prisma/schema/`

New file `organization.prisma`:

```prisma
enum OrgRole { owner admin member viewer }
enum TeamRole { lead member }
enum ProjectRole { manager contributor viewer }
enum InviteStatus { pending accepted revoked expired }
enum JoinRequestStatus { pending approved rejected }

model Organization {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  description String?
  logoUrl     String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  memberships OrgMembership[]
  teams       Team[]
  projects    Project[]
  invites     Invite[]
  joinRequests JoinRequest[]

  @@map("organizations")
}

model OrgMembership {
  id             String   @id @default(cuid())
  organizationId String
  profileId      String
  role           OrgRole  @default(member)
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  profile      Profile      @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@unique([organizationId, profileId])
  @@index([profileId])
  @@map("org_memberships")
}

model Team {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  description    String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  memberships  TeamMembership[]
  projects     Project[]

  @@index([organizationId])
  @@map("teams")
}

model TeamMembership {
  id        String   @id @default(cuid())
  teamId    String
  profileId String
  role      TeamRole @default(member)
  createdAt DateTime @default(now())

  team    Team    @relation(fields: [teamId], references: [id], onDelete: Cascade)
  profile Profile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@unique([teamId, profileId])
  @@index([profileId])
  @@map("team_memberships")
}

model Invite {
  id             String       @id @default(cuid())
  organizationId String
  email          String?
  tokenHash      String       @unique
  role           OrgRole      @default(member)
  teamId         String?
  status         InviteStatus @default(pending)
  invitedById    String?
  expiresAt      DateTime
  acceptedAt     DateTime?
  createdAt      DateTime     @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([status])
  @@map("invites")
}

model JoinRequest {
  id             String            @id @default(cuid())
  organizationId String
  profileId      String
  message        String?
  status         JoinRequestStatus @default(pending)
  decidedById    String?
  decidedAt      DateTime?
  createdAt      DateTime          @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, profileId])
  @@index([status])
  @@map("join_requests")
}
```

Edits to existing files:
- `project.prisma` → `Project`: add `organizationId String?` (+ relation, `@@index`), `teamId String?` (+ relation), and `role ProjectRole @default(contributor)` on `ProjectMember`.
- `agent.prisma` → `Agent`: add `managerId String?` self-relation (`manager`/`reports`) for the org chart.
- `user.prisma` → `Profile`: add back-relations `orgMemberships OrgMembership[]`, `teamMemberships TeamMembership[]`.

### Migration + backfill (`prisma migrate`)
1. `prisma migrate dev --name add_org_team_roles` (all new columns nullable).
2. Data migration (seed step / SQL in migration): create ONE `Organization`
   (`name`/`slug` from `License.org`, fallback `"Default Organization"`); set every
   `Project.organizationId` to it; create an `OrgMembership(owner)` for the `AdminUser`'s
   `Profile`; default existing `ProjectMember.role = contributor`.
3. Follow-up migration flips `Project.organizationId` to `NOT NULL` once backfilled.

### GraphQL — `packages/graphql-server/src/types/`
- New `organization.ts`: types `Organization`, `OrgMembership`, `Team`, `TeamMembership`,
  `Invite`, `JoinRequest`; queries `organization`, `myOrganizations`, `orgMembers`,
  `teams`, `team`, `pendingJoinRequests`, `pendingInvites`, `orgChart`.
- Mutations: `updateOrganization`, `createTeam`/`updateTeam`/`deleteTeam`,
  `addTeamMember`/`removeTeamMember`, `setMemberRole`, `createInvite`/`revokeInvite`,
  `acceptInvite`, `requestToJoin`, `approveJoinRequest`/`rejectJoinRequest`,
  `setAgentManager`.
- Extend `Project` type with `organization`, `team`, and `ProjectMember.role`.

### REST — `apps/web/app/api/`
- `POST /api/invites/[token]/accept`, `GET /api/invites/[token]` (unauth landing).
- `GET /api/organizations/[id]/org-chart` → JSON (SVG/PNG render is a later sub-task,
  port Paperclip's `org-chart-svg.ts`).

### Backend services — `apps/web/src/server/`
- `organization.ts` (CRUD + bootstrap-org helper), `membership.ts` (role resolution),
  `invite.ts` (token hash/verify, reuse `_lib/api-key.ts` HMAC pattern), `org-chart.ts`.
- **RBAC helper** `require-role.ts` (mirrors existing `require-feature.ts`): resolve the
  caller's `OrgRole` and gate mutations. This becomes the authz primitive that #3
  (governance) and #4 (budgets) build on.

### UI — `apps/web/app/(dashboard)/`
- `settings/organization` (name/logo/slug), `settings/members` (role management, invites),
  `settings/teams` (team CRUD + membership), invite landing `app/(auth)/invite/[token]`.
- Org chart view under `settings/organization/chart` (React flow of reports-to).
- Mobile: members list + accept-invite screen (later).

### Feature-flag + license
- Gate teams/invites behind a new `organizations` flag (default ON for owner) via existing
  `feature-flags.ts`. Enforce `License.maxSeats` on `createInvite`/`acceptInvite`.

### Acceptance checklist
- [ ] Migration runs clean on an existing seeded DB; one org backfilled, admin = owner.
- [ ] Projects list scoped to the org; all existing projects visible.
- [ ] Owner can invite by email → token link → accept → becomes member with role.
- [ ] Role gating: viewer cannot create/delete projects; manager can.
- [ ] Team CRUD + assign projects to a team; team-scoped project filter works.
- [ ] Org chart renders reports-to from `Agent.managerId`.
- [ ] `require-role.ts` unit-tested; existing tasks/tests unaffected (no FK regressions).

### Risks
- **Backfill correctness** — every `Project` must attach to the bootstrapped org or it
  disappears from scoped queries. Verify count before flipping to `NOT NULL`.
- **Profile vs AdminUser** — invites create a `User`+`Profile`; make sure the single-admin
  login path still works and new members get a `Profile(kind=human)`.
- Keep `Project`-scoped queries backward-compatible (org filter optional until UI ships).

---

## Detailed gap inventory (per domain)

### 1. Org / Companies / Teams / Roles — 🔴
Paperclip's container is a **Company** (multi-tenant); AgentCenter's is a **Project**.

Missing:
- `Company` / `Team` entities above `Project`; multi-company tenancy + company switcher UI
- Org chart (reports-to hierarchy) → JSON / SVG / PNG render
- Membership **roles** (owner/admin/member) + resource-scoped memberships; instance-level user roles
- **Invites** (token landing + onboarding bundle); **join requests** + approval queue
- **Company export/import** (full org portability; import preview → apply)
- CEO bootstrap / front-door onboarding wizard

### 2. Multi-provider agent adapters — 🔴
OpenClaw-only today. Paperclip ships 11 adapters (Claude, Codex, Cursor local+cloud, Gemini, Grok, opencode, pi, hermes, openclaw-gateway).

Missing:
- Adapter registry / install / reload + per-adapter config schema
- Per-adapter model listing / model-profiles / detection
- Claude / Codex subscription auth panels
- Per-agent adapter secret bindings (pairs with #5)

### 3. Governance / Approvals / Permissions — 🔴
AgentCenter has lead approve/reject/clarify on tasks only.

Missing:
- First-class **Approvals** entity (create/approve/reject/resubmit) + comment threads + task linking
- **Principal permission grants** + authz engine (per-resource, per-command)
- **Trust presets** (low-trust containment, source-trust badges, untrusted-PR review, low-trust work-product promotion)
- **Change-consent gate**, execution allowlist/policy, responsible-user denial outcomes

### 4. Budgets / Cost / Finance — 🔴
Only Cloud-VM cost today.

Missing:
- **Budget policies** at company + per-agent level, with **hard-stop auto-pause** via incidents
- **Cost events** ingestion + breakdowns (by agent / model / provider / biller / project)
- **Quota windows** + window-spend tracking + provider quota cards
- **Finance events** + summaries; budget incidents + resolution

### 5. Secrets management — 🔴 (none today)
- Secret vault: company secrets CRUD + versions + **rotation**
- Secret **providers** (e.g. AWS) + configs + health
- **Bindings** to agents/adapters; usage tracking; access-events audit
- User-level secret declarations/definitions + coverage

### 6. Plugins / Extensibility — 🔴 (only first-party bridge)
- Plugin SDK + install/enable/disable/upgrade lifecycle + registry/loader/manifest validation
- Plugin **tools**, **jobs** (scheduler), **webhooks**, **state/database**, **UI contributions**
- Plugin-managed resources (agents/routines/skills); logs; health dashboard
- Third-party integration framework (GitHub / Slack / webhooks — currently PLANNED in docs)

### 7. Pipelines / Routines — 🟠
Have recurring tasks + heartbeat.

Missing:
- **Routines** (triggers, cron editor, public fire URL, run history, revisions)
- **Pipelines** (multi-stage workflows; cases with claim/transition/breakdown; review-cases inbox; pipeline health/liveness)

### 8. Task reliability / autonomy — 🟠
Solid lifecycle already.

Missing:
- **Atomic issue checkout**, **watchdogs**, **recovery actions** (detect + resolve stuck runs)
- **Plan decomposition**, **tree holds / pause guard**, **run liveness + continuations/handoff**
- Execution decisions/policy; issue diagnostics (blockers/wakes/subtree)

### 9. Environments / Workspaces / Terminals — 🟠
Strong on Cloud VMs already.

Missing:
- **Execution workspaces** (close-readiness, reconcile-branch), **git worktrees**
- **Workspace runtime services** (start/stop), **live terminals** (xterm/WS)
- Sandbox providers; custom image templates with setup sessions

### 10. Skills catalog / studio — 🟠
174 agent templates already (a strength).

Missing:
- **Company skills library** + **Skill Studio** (test inputs, test-run templates, fork/precheck, starring/comments)
- Runtime skill selection per agent/run
- **Teams catalog** (install a whole team into a company)

### 11. Deliverables / Docs / Goals — 🟡
Have versioning + project docs.

Missing:
- **Document annotations** (threads/comments/anchors), **diff viewer**
- **Goals** (goal tree + project goals)
- **External objects** (GitHub-backed refs/mentions); feedback votes/exports

### 12. CLI — 🟠 (none today)
Paperclip ships a ~250-command CLI covering the full API (connect wizard, issues/checkout, agents, routines, secrets, budgets, workspaces, plugins). Big automation/agent-UX lever.

### 13. Observability / Analytics — 🟢 near parity
Add: **run ledger / live-run transcript** view; **OpenAPI** spec generation; feedback traces.

---

_Last updated: 2026-07-11. Owner: platform. This is a living document — plans are appended per epic as they are designed._
