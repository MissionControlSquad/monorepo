---
name: agentcenter-conventions
description: >
  Binding conventions for ANY change to the AgentCenter monorepo — the D1–D5 architectural
  decisions and the stack patterns to match. Read this FIRST before writing code, adding a
  model/endpoint/UI, or reviewing a diff. Use whenever working in apps/web, packages/*, or
  docs/gap-plans.
---

# AgentCenter conventions

The full rulebook is [`docs/gap-plans/CONVENTIONS.md`](../../../docs/gap-plans/CONVENTIONS.md).
This skill is the always-on summary. If this and an epic spec disagree, **stop and flag** — don't guess.

## The five binding decisions (D1–D5)

1. **D1 — buildbase = humans only.** buildbase (`@buildbase/sdk`) is the system-of-record for human
   identity, workspaces, human roles, feature entitlement, and the customer's subscription/billing.
   It has **no concept of an AI agent.** Never model an agent as a buildbase user.
2. **D2 — Two planes, one bridge.** SaaS plane (buildbase) and agent/domain plane (AgentCenter) are
   bridged **only** by `workspaceId` (+ `Profile(kind=human).buildbaseUserId`). Agents authenticate
   with `Agent.apiKeyHash` (`resolveAgent`) and **never call buildbase**.
3. **D3 — Shared-workspace RBAC.** All humans in a workspace see all its agents/data. buildbase role
   gates capability (`owner`/`admin` = manage, `member` = view). **No per-agent object-ACL.** Gate the
   **mutation**, not the object.
4. **D4 — Ownership split.** Agent-domain governance (`Approval`, `AgentTrustProfile`), agent budgets
   (`CostEvent`/`BudgetPolicy`/auto-pause), and all agent lifecycle/config/secrets/tasks stay in
   AgentCenter Postgres. The custom `License` singleton and local `FeatureFlag` model are **retired**
   in favor of buildbase.
5. **D5 — Workspace scoping.** Every domain root row carries `workspaceId String` (buildbase workspace
   `_id`; a string; **no Prisma FK**; always `@@index([workspaceId])`). Every list/read resolver calls
   `scoped(ctx, where)`; every mutation authorizes via `requireRole`/`requirePermission` on `ctx.tenancy`.

## Hard guardrails (everywhere)

- **DO NOT** touch agent auth (`apiKeyHash`/`resolveAgent`), the mc-bridge wire protocol, or existing
  agent lifecycle endpoints except to add `workspaceId` scoping.
- **DO NOT** gate features on `License.features` or the local `FeatureFlag` model — use a **buildbase
  feature slug** via `requireFeature(ctx, slug)`. (Note: the legacy `isFeatureEnabled` chain silently
  re-introduces `License` — don't reuse it as-is.)
- **DO NOT** accept `workspaceId`/`createdBy` from client input — always derive from `ctx.tenancy`.
- **DO NOT** return another workspace's rows. Workspace isolation is a **security boundary**.

## Stack conventions (match existing code exactly)

- **Prisma** split schema `packages/database/prisma/schema/*.prisma`; `cuid()` ids; `@@map("snake_case")`;
  lowercase enum members; explicit `@@index`. Data access as a module `packages/database/src/<domain>/`,
  re-exported from `src/index.ts` (mirror `src/cloud-vm/`).
- **GraphQL** Pothos `builder.prismaObject` in `packages/graphql-server/src/types/<name>.ts` (register in
  `types/index.ts`); ops in `apps/web/src/server/graphql/{queries,mutations,subscriptions}/`.
- **REST** `apps/web/app/api/**/route.ts` with `_lib/` helpers (`json-response`, `validation`,
  `with-rate-limit`, `resolve-agent`, `resolve-session`).
- **Events** through `events/bus.ts` (`emit`), types in `events/types.ts` + `EventTypes`
  (`packages/utils/src/domain-constants.ts`), side-effects as `events/handlers/*`.
- **Realtime** `pubsub` + graphql-ws. **Storage** R2 (`storage/r2.ts`). **Crypto at rest** reuse the
  AES-256-GCM envelope in `services/ssh-keys.ts` (secrets are encrypted; API keys are SHA-256 hashed —
  never confuse them). **Cron** routes under `app/api/cron/*` guarded by `env.CRON_SECRET`.

**If a spec cites a file/function, verify it exists before using it. If it doesn't, flag the spec.**
