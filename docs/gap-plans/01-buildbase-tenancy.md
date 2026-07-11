# Epic #1 — Tenancy foundation via buildbase (workspaces + RBAC + flags + billing)

**Phase:** 0 (Foundation) · **Must land first** — every later epic scopes to `workspaceId` and
gates via buildbase roles/permissions instead of a hand-built `require-role.ts`.

**Decision (confirmed):** **buildbase everywhere.** Use `@buildbase/sdk` (already used by the
MissionControlSquad website) as the system-of-record for tenancy, auth, RBAC, feature flags,
subscriptions/quotas, and notifications in **both** tiers:
- **Cloud tier** → SDK `serverUrl = https://api.console.buildbase.app` (managed).
- **Self-host tier** → SDK `serverUrl = http://bb-tenant-server:4101` (the 4-service
  [`buildbase-app/self-hosted-starter`](https://github.com/buildbase-app/self-hosted-starter)
  stack running in the client's compose file). App data stays on the VPS; only a licensing
  heartbeat reaches buildbase's Central Server.

**Same code both tiers — only `serverUrl` + the Installation credentials differ.** This deletes the
previously-planned Postgres `Organization`/`OrgMembership`/`Team` models and the custom `License`
singleton; AgentCenter domain data (agents, tasks, deliverables, VMs) stays in Postgres, **keyed by
`workspaceId`**.

---

## What buildbase provides (so we do NOT build it)
| Capability | buildbase surface |
|---|---|
| Multi-workspace tenancy | `useSaaSWorkspaces()`, `<WorkspaceSwitcher/>`, server `workspace.{list,get,create,update,delete}` |
| Members + roles | `addUser/removeUser/updateUser`, `users.{invite,remove,updateRole}` |
| RBAC gating | `<WhenRoles>`, `<WhenWorkspaceRoles>`, server `permissions.{check,resolve}` |
| Feature flags | `useUserFeatures()`, `<WhenWorkspaceFeatureEnabled slug>`, server `features.{list,update}` |
| Billing / plans / trials | `useSubscriptionContext()`, `useTrialStatus()`, `<WhenSubscriptionToPlans>`, server `subscription.*` |
| Metered quotas | `useRecordUsage()`, quota gates, server `usage.{record,recordBatch,getQuota,getAll}` |
| Auth (OAuth console) | `useSaaSAuth()`, `SaaSOSProvider`, cookie-bridge routes |
| Notifications / push | server `notification.send(workspaceId, event, userId?, data?)` |
| Per-VPS licensing | buildbase **Installation** (`INSTALLATION_ID` / `INSTALLATION_API_KEY`) → replaces `License` |

## Scope boundary — buildbase is for HUMANS only; AI agents are untouched

buildbase has **no concept of an AI agent** (its members are humans-by-email with owner/admin/member
roles). AgentCenter runs on **two planes**, bridged by exactly one field — `workspaceId`:

| | **SaaS plane (buildbase)** | **Agent/domain plane (AgentCenter)** |
|---|---|---|
| Actors | **Humans only** (the paying customer + teammates) | **Agents** (+ humans acting in a workspace) |
| Identity/auth | buildbase session (`bb-session-id` cookie) | `Agent.apiKeyHash` / `resolveAgent` — **unchanged** |
| Owns | workspaces, human members, human roles, subscriptions/plans, entitlement flags, invoices | agents, tasks, deliverables, channels, cloud VMs, secrets, adapters, pipelines, skills |
| Billing | the customer's subscription (Stripe on buildbase) — **same as today** | agent token/run cost tracking (`CostEvent`) — internal, not a buildbase bill |

**Nothing about agents changes.** `Profile(kind=agent)` stays pure AgentCenter; agent create/sleep/
wake/heartbeat, config bundles, the mc-bridge, adapters (#2), secret bindings (#5), and agent trust
(#3) are all untouched. The **only** coupling: every domain root carries `workspaceId` = the buildbase
workspace that owns it, and `Profile(kind=human).buildbaseUserId` links a human to a buildbase user.

**Two auth paths, resolved independently in the GraphQL context:**
- Human request → `bb-session-id` cookie → `ctx.tenancy = { userId, workspaceId, role }` (buildbase).
- Agent request → `Bearer mc_…` → `ctx.agent` (`apiKeyHash`); the agent's `workspaceId` comes from its
  own `Agent` row (stamped when a human created it). **Agents never call buildbase.**

## Human RBAC over agents — shared-workspace model (decided)

Multiple humans in one workspace **all see all of that workspace's agents.** Access is **capability
RBAC via buildbase workspace roles only** — there is **no per-agent object-ACL**:

| buildbase role | Agents (and projects/VMs/tasks in the workspace) |
|---|---|
| `owner` | see + manage all · billing · settings · invite |
| `admin` | see + manage all (create/edit/delete/approve/assign) |
| `member` | see all · view-only (no create/edit/delete) |

Gate the **mutation, not the object**: `requireRole(ctx, 'admin')` on agent create/edit/delete;
list/read requires only workspace membership + `scoped(ctx, where)` on `workspaceId`. No
`Agent.visibility` / `AgentAccessGrant` tables are built now.

**Deferred (additive, no migration cost later):** per-agent restricted visibility. If a customer ever
needs "hide agent X from teammate Y," add `Agent.visibility (workspace|restricted)` + `ownerUserId` +
an `AgentAccessGrant(agentId, userId, level)` table, and extend the list filter to
`visibility=workspace OR ownerUserId=ctx.user OR hasGrant OR role in [admin,owner]`. buildbase cannot
express per-object ACLs (its permissions are capability strings, not resource IDs), so this stays an
AgentCenter-domain feature if/when required.

## Reuse analysis (don't reinvent)
- **Reuse the website's proven wiring verbatim** — copy from `MissionControlSquad-website`:
  `components/providers/BuildbaseProvider.tsx` (the `SaaSOSProvider` + callbacks), `app/api/auth/token/route.ts` (code→session exchange against `${serverUrl}/api/v1/auth/token`), `lib/hooks/useWorkspaceSubscription.ts`, `lib/jwt.ts` (the `{userId, workspaceId, userRole, email}` app-JWT minter), and `app/api/auth/{session,logout,workspace-token}` routes.
- **Reuse `@buildbase/sdk` server factory** `BuildBase({ serverUrl, orgId, getSessionId })` — no bespoke REST client.
- **Reuse AgentCenter's existing GraphQL context/middleware** (`apps/web/src/server/graphql/context`) to attach a resolved `TenancyContext` once per request.
- **Reuse the existing self-hosted compose** (`apps/web/self-hosted/docker-compose.yml`) — add the 4 buildbase services beside the existing Postgres+Redis+app.
- **Retire (do not build / delete):** the planned Postgres `Organization`/`OrgMembership`/`Team`/`Invite`/`JoinRequest`; the hand-built `require-role.ts` role store; the `License` singleton (`system.prisma`) and its `license.ts` verification; the `AdminUser` password-login path (buildbase auth replaces it); and the local `FeatureFlag` model (migrate slugs to buildbase). Each is superseded, not extended.
- **Keep:** every AgentCenter domain model; add a `workspaceId` column + index. Keep a **thin seam** — a `TenancyProvider` TypeScript interface with a single `BuildbaseTenancy` implementation — so the app never imports the SDK directly in resolvers (insulation only, not a second backend).

## Architecture
```
Client  (apps/web)
  SaaSOSProvider(serverUrl, orgId, auth{clientId, callbacks})   ← from website's BuildbaseProvider
   ├─ useSaaSAuth()          sign in/out, user
   ├─ useSaaSWorkspaces()    workspaces, currentWorkspace, switch, members
   ├─ <WorkspaceSwitcher/>   in the dashboard shell
   └─ <WhenWorkspaceRoles/> / <WhenWorkspaceFeatureEnabled/>   UI gating

Auth cookie-bridge   (apps/web/app/api/auth/*)
   verify (code→sessionId, set bb-session-id cookie) · session · signout · workspace-token

Server   (apps/web/src/server/tenancy.ts)
  const bb = BuildBase({ serverUrl, orgId, getSessionId: cookie('bb-session-id') })
  GraphQL context → resolveTenancy(req):
     sessionId  = cookie('bb-session-id')
     const { user }        = await bb.withSession(sessionId).auth()
     const workspaceId     = header('x-workspace-id') ?? activeWorkspaceFromToken(req)
     const perms           = await bb.permissions.resolve(workspaceId, user.id)   // cached (redis, short TTL)
     ctx.tenancy = { userId: user.id, workspaceId, role: perms.role, can: (p)=>perms.permissions.includes(p) }
  requireRole(ctx, 'admin') / requirePermission(ctx, 'task:approve')  ← read ctx.tenancy
  scoped(ctx, where) = { ...where, workspaceId: ctx.tenancy.workspaceId }
```

## Schema changes — `packages/database/prisma/schema/`
`workspaceId` is buildbase's workspace `_id` (a Mongo ObjectId **string**) — stored as `String`,
indexed, **no Prisma FK** (buildbase owns the workspace table).

- Add `workspaceId String` + `@@index([workspaceId])` to the top-level domain owners: **`Project`**,
  **`Agent`**, **`CloudVM`**, **`Channel`**, **`Notification`/`UserNotification`**, and any other
  currently instance-global root (tasks/deliverables/docs inherit scope through `Project`/`Agent`).
- `Profile` (human): add `buildbaseUserId String? @unique` to map a buildbase user → local Profile.
- **Delete** the never-built `organization.prisma` plan. **Deprecate** `system.prisma`'s `License`
  (reads replaced by buildbase subscription); keep `SystemSettings` for non-tenancy instance config.
- `AdminUser`: keep transitionally for a bootstrap/break-glass path; primary login moves to buildbase.

## Migration + backfill (end-to-end)
```bash
# 0. In the buildbase dashboard: create an Installation → INSTALLATION_ID / INSTALLATION_API_KEY,
#    create the default workspace, note orgId (24-hex) + OAuth clientId/secret.

# 1. Additive migration — nullable workspaceId columns
cd packages/database
pnpm prisma migrate dev --name add_workspace_scoping   # ADD COLUMN "workspaceId" text (nullable) + indexes

# 2. Backfill: single-tenant install → one workspace. Set every root row to the default workspace id.
cat >> prisma/migrations/*_add_workspace_scoping/migration.sql <<'SQL'
UPDATE "projects"     SET "workspaceId" = current_setting('app.default_workspace_id') WHERE "workspaceId" IS NULL;
UPDATE "agents"       SET "workspaceId" = current_setting('app.default_workspace_id') WHERE "workspaceId" IS NULL;
UPDATE "cloud_vms"    SET "workspaceId" = current_setting('app.default_workspace_id') WHERE "workspaceId" IS NULL;
UPDATE "channels"     SET "workspaceId" = current_setting('app.default_workspace_id') WHERE "workspaceId" IS NULL;
-- …repeat for each scoped root. default_workspace_id supplied by the backfill runner (env WORKSPACE_ID).
SQL
WORKSPACE_ID=<default-ws> pnpm tsx src/backfill/workspace-scoping.ts   # sets the GUC + runs

# 3. Verify no NULLs, then flip NOT NULL
pnpm prisma migrate dev --name workspace_id_required
```
**Rollback:** columns nullable until step 3, so a pre-step-3 rollback loses nothing; after, revert
`workspace_id_required` first. `License` deprecation is behind a `TENANCY=buildbase` flag so the old
path can be re-enabled during cutover.

## Self-host docker-compose (`apps/web/self-hosted/docker-compose.yml`)
Add the 4 buildbase services from the self-hosted-starter beside the existing app+Postgres+Redis:
```yaml
  bb-mongodb:       { image: mongo:7 }
  bb-redis:         { image: redis:7 }         # (or reuse the app's redis)
  bb-tenant-server: { image: buildbase/tenant-server, ports: ["4101"],
                      environment: [JWT_PASS, DB_ENCRYPTION_KEY, SECRET_KEY, OAUTH2_SECRET,
                                    INSTALLATION_ID, INSTALLATION_API_KEY, TENANT_SERVER_URL] }
  bb-client:        { image: buildbase/client, ports: ["4100"], environment: [CLIENT_URL] }
  bb-auth:          { image: buildbase/auth,   ports: ["4103"], environment: [AUTH_URL] }
  agentcenter:      { environment: [ SAAS_SERVER_URL=http://bb-tenant-server:4101, SAAS_ORG_ID, SAAS_CLIENT_ID ] }
```
Secrets (`.env.selfhost`): `JWT_PASS`, `DB_ENCRYPTION_KEY`, `SECRET_KEY`, `OAUTH2_SECRET`, plus the
Installation credentials and public SSL URLs (`CLIENT_URL`, `TENANT_SERVER_URL`, `AUTH_URL`).

## GraphQL / REST / UI
- **GraphQL context** resolves `ctx.tenancy` once per request (above); all resolvers call
  `scoped(ctx, where)` and `requireRole`/`requirePermission`.
- **Auth routes** (`app/api/auth/{verify,session,signout,workspace-token}`) copied from the website.
- **Dashboard shell** mounts `SaaSOSProvider` + `<WorkspaceSwitcher/>`; replace the single-`AdminUser`
  login screen with buildbase sign-in. Gate nav with `<WhenWorkspaceRoles>`.
- **Feature flags:** migrate existing `FLAG_KEYS` (channels, analytics, cloud_vms, …) to buildbase
  feature slugs; server checks via `bb.features.list` / client via `useUserFeatures`.

## Feature-flag + license
- buildbase **Feature Flags** + **Subscriptions/Plans** ARE the flag + entitlement layer now. Plan
  gating via `<WhenSubscriptionToPlans>` / `subscription.get`. The per-VPS license = buildbase
  **Installation**. Retire `FLAG_DEFAULTS`/`isFeatureLicensed`/`License` after the slug migration.

## Test cases
**Unit (`vitest.unit-no-db.config.ts`; inject a fake `BuildBase()` via the SDK's `fetch` option):**
- `tenancy.resolveTenancy` maps a session → `{ userId, workspaceId, role }`; missing session → null/401.
- `requireRole`/`requirePermission` allow/deny correctly against a mocked `permissions.resolve`.
- `scoped(ctx, where)` injects `workspaceId`; never returns cross-workspace filters.

**Integration (GraphQL + DB, `vitest.config.ts`, buildbase server mocked):**
- A query returns only current-workspace rows; a second session bound to workspace B returns B's rows (isolation).
- An admin-only mutation is denied for a `member` role and allowed for `admin` (mock `permissions.resolve`).
- Feature-gated resolver throws when the workspace feature slug is off.

**Migration test:**
- Seed pre-migration fixture (N projects/agents, no workspaceId) → run backfill with a default workspace → assert all rows scoped, zero NULLs, NOT NULL holds; re-run → idempotent.
- Cross-workspace isolation: seed 2 workspaces, assert no query leaks rows across them.

**E2E (`apps/web/tests/e2e`, test Installation / mock tenant-server):**
- Sign in via buildbase → `WorkspaceSwitcher` → create a project in workspace A → switch to B → project not visible.
- Self-host: `docker compose -f self-hosted/docker-compose.yml up` brings up bb-tenant-server; the app authenticates against `http://bb-tenant-server:4101` and creates a workspace.

## Best-approach confirmation
buildbase-everywhere is the right call given (a) the existing investment (website + `@buildbase/sdk`
+ `buildbase` git identity) and (b) the self-hosted starter, which makes buildbase runnable on the
client VPS with app data staying local. It yields **one code path** (serverUrl is the only tier
difference), makes buildbase the single source of truth for tenancy/RBAC/billing, and lets buildbase's
Installation licensing replace the bespoke `License` model. **Rejected:** the hand-built Postgres
tenancy layer (now redundant double-maintenance) and a two-adapter interface (unnecessary once
buildbase self-hosts; retained only as a 1-file `TenancyProvider` seam so resolvers don't import the
SDK directly).

## Acceptance checklist
- [ ] `SaaSOSProvider` + auth cookie-bridge routes work in the monorepo (ported from the website).
- [ ] GraphQL context resolves `{ userId, workspaceId, role }` per request; cached to avoid N round-trips.
- [ ] `requireRole`/`requirePermission` gate resolvers via buildbase `permissions.resolve`.
- [ ] Every domain root has `workspaceId`; all reads/writes scoped; cross-workspace isolation proven.
- [ ] `WorkspaceSwitcher` switches active workspace and re-scopes the dashboard.
- [ ] Self-host compose brings up the 4 buildbase services; app points `SAAS_SERVER_URL` at the local tenant-server.
- [ ] `FeatureFlag`/`License` retired; entitlement via buildbase features/subscriptions; Installation licensing active.
- [ ] Existing `AdminUser` users migrated/invited into buildbase; break-glass path documented.

## Risks
- **New ops surface:** self-host now runs MongoDB + 3 buildbase services. Document sizing; consider reusing the app's Redis.
- **Per-request round-trips** to the tenant-server for role/permission/quota — resolve once per request into context + short-TTL redis cache; handle tenant-server downtime (fail-closed on auth, cached role fallback).
- **`workspaceId` is not a Postgres FK** — enforce at the app layer + index; a workspace deleted in buildbase must trigger reconciliation (webhook/`workspace:deleted` event → soft-archive scoped data).
- **Auth cutover:** migrate existing `AdminUser`/password users into buildbase (invite flow); plan a maintenance window.
- **Licensing heartbeat** to buildbase Central Server is a standing outbound dependency for on-prem — disclose to air-gapped buyers (they cannot use this path; that's the only case the retired local adapter would have served).
- **React 19 peer dep** — monorepo is already on React 19 (compatible). Verify SDK CSS import doesn't clash with the existing Tailwind build.
