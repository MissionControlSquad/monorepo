---
name: buildbase-tenancy
description: >
  How AgentCenter integrates buildbase for human tenancy — auth, workspaces, human roles, feature
  flags, and the customer's billing — while keeping AI agents 100% in AgentCenter. Use whenever
  touching login/session, workspace scoping, human RBAC, feature entitlement, plan limits, or when
  adding workspaceId to a domain model. Full spec: docs/gap-plans/01-buildbase-tenancy.md.
---

# buildbase tenancy (humans) ↔ AgentCenter (agents)

buildbase (`@buildbase/sdk`) is the SaaS layer for **humans**. AgentCenter owns **agents**. They meet
only at `workspaceId`. Full plan: [`docs/gap-plans/01-buildbase-tenancy.md`](../../../docs/gap-plans/01-buildbase-tenancy.md).

## Two planes

| SaaS plane (buildbase) | Agent/domain plane (AgentCenter) |
|---|---|
| Humans (email login), workspaces, human roles, subscription/plan, feature flags, notifications | Agents, tasks, deliverables, channels, cloud VMs, secrets, adapters, agent cost/budgets, agent trust |
| `bb-session-id` cookie → `ctx.tenancy` | `Agent.apiKeyHash` → `ctx.agent` (unchanged) |

Both tiers use the **same code**; only `serverUrl` differs — cloud = `api.console.buildbase.app`,
self-host = the 4-service `buildbase-app/self-hosted-starter` stack (`http://bb-tenant-server:4101`).

## Server integration (grounded in the website's working wiring)

- Client: `SaaSOSProvider` (port `components/providers/BuildbaseProvider.tsx` from the website) +
  `useSaaSAuth`/`useSaaSWorkspaces`/`<WorkspaceSwitcher/>`/`<WhenWorkspaceRoles/>`.
- Auth cookie-bridge routes: `app/api/auth/{verify,session,signout,workspace-token}` (port from website).
- Server factory: `apps/web/src/server/tenancy.ts` = `BuildBase({ serverUrl, orgId, getSessionId })`.
  In the Yoga GraphQL context (`app/api/graphql/route.ts`) resolve once per request:
  `sessionId → auth() → { userId } ; workspaceId ; permissions.resolve(workspaceId, userId) →
   ctx.tenancy = { userId, workspaceId, role, can }`. Cache role/permission in Redis (short TTL).
- Helpers every resolver uses: `requireRole(ctx, 'admin')`, `requirePermission(ctx, p)`,
  `scoped(ctx, where)` (injects `workspaceId`), `requireFeature(ctx, slug)`.

## Rules

- `workspaceId` is a **string** (buildbase workspace `_id`), stored with `@@index`, **no Prisma FK**.
- Agents never call buildbase. The **only** buildbase touchpoints from agent flows are: (a) resolving
  the human's role/feature/quota in the human request path, and (b) reading the workspace's plan quota
  (e.g. max agents) at agent-create time.
- Human RBAC = buildbase roles. **Do not** hand-build a human permission store. Agent authz
  (`AgentTrustProfile`) is AgentCenter-domain.
- Retire `License`/local `FeatureFlag`: entitlement = buildbase features/subscriptions; per-VPS license
  = buildbase Installation.
- On `workspace:deleted` (buildbase webhook/event), reconcile: soft-archive that workspace's scoped data.

## Anti-patterns

- ❌ Modeling an agent as a buildbase member. ❌ A per-agent human ACL (see D3 — shared workspace).
- ❌ Trusting a client-supplied `workspaceId`. ❌ Gating on `License.features`.
- ❌ A per-request buildbase call inside a hot loop — resolve once into `ctx.tenancy` + cache.
