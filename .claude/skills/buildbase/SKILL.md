---
name: buildbase
description: >
  How to integrate and use @buildbase/sdk in AgentCenter — the official Next.js golden path (auth
  routes, SaaSOSProvider, server BuildBase() factory, workspace/role resolution, feature flags,
  quota) plus AgentCenter's deliberate adaptations. Read this before touching anything that uses
  buildbase (auth, workspaces, human roles, billing, quota, workspaceId). Vendored so no developer
  misses it.
---

# buildbase integration

**Canonical source (read for depth):** the official buildbase Claude skill —
`https://github.com/buildbase-app/claude-skill` → `plugins/buildbase/SKILL.md` and
`plugins/buildbase/knowledge/` (`patterns/nextjs-integration.md`, `sdk/auth.md`,
`sdk/server-side.md`, `sdk/feature-flags.md`, `sdk/quota-usage.md`). It is grounded against the SDK +
`nextjs-starter`. Also: `buildbase-selfhost` skill for self-hosted operators, and
`https://github.com/buildbase-app/self-hosted-starter`.

buildbase governs **humans** (identity, workspaces, human roles, subscription/billing, feature flags,
quota, notifications). AgentCenter owns **agents**. See the companion skill `buildbase-tenancy` and
`docs/gap-plans/01-buildbase-tenancy.md` for the two-plane model.

## Official Next.js golden path (essentials)

**Env vars** (skill names → AgentCenter uses `SAAS_*` equivalents, see Deltas):
```
NEXT_PUBLIC_BUILDBASE_SERVER_URL=https://api.console.buildbase.app
NEXT_PUBLIC_BUILDBASE_ORG_ID=<24-char-hex>
NEXT_PUBLIC_BUILDBASE_CLIENT_ID=<client-id>
NEXT_PUBLIC_BUILDBASE_REDIRECT_URL=http://localhost:3000
BUILDBASE_CLIENT_SECRET=<secret>
```

**Server factory** `src/lib/buildbase.ts` — `BuildBase({ serverUrl, orgId, getSessionId })` (default
import). Destructures `auth, workspace, subscription, users, plans, usage, credits, features,
settings, notification, withSession, client`. `auth()` resolves the current user + workspace
server-side; `getSessionId` reads the `bb-session-id` cookie via `next/headers`.

**Auth routes:**
- `POST /api/auth/token` — exchange OAuth `code` at `${serverUrl}/api/v1/auth/token`
  (`{code, clientId, clientSecret, orgId}`) → set httpOnly `bb-session-id` cookie (7-day).
- `GET /api/auth/session` — read `bb-session-id` → `{ sessionId }`.
- `POST /api/auth/signout` — clear `bb-session-id`.
- `POST /api/auth/workspace-token` (optional, app-specific) — mint an app JWT `{userId, workspaceId,
  userRole}`; client stores it in `localStorage` as `auth_token`.

**Client provider** `SaaSOSProvider` (`@buildbase/sdk/react`) with `serverUrl`, `version:
ApiVersion.V1`, `orgId`, `auth.clientId`, `auth.redirectUrl`, `auth.callbacks` (`getSession`,
`handleAuthentication(code)`, `onSignOut`, `onWorkspaceChange({workspace,user,role})`), and
`defaultPermissions` (role → permission strings). Import `@buildbase/sdk/css` in the root layout.

**Flow:** sign-in redirects to buildbase → back to `redirectUrl` with `?code=` → SDK
`handleAuthentication` → `POST /api/auth/token` → httpOnly cookie. On refresh, `getSession` →
`/api/auth/session`. Workspace switch → `onWorkspaceChange` → `/api/auth/workspace-token`.

**Server-side use:** feature flags via `features`, quota via `usage`/`credits`, notifications via
`notification.send(...)`, protected routes gate on `const s = await auth(); if (!s) 401`.

## AgentCenter deltas (deliberate — see the code)
- **Env:** `SAAS_SERVER_URL` / `SAAS_ORG_ID` / `SAAS_CLIENT_ID` / `SAAS_CLIENT_SECRET` /
  `NEXT_PUBLIC_SAAS_*` / `SYSTEM_SECRET` (matches the MissionControlSquad website's buildbase org).
  `buildbase.ts` also accepts the `NEXT_PUBLIC_BUILDBASE_*` fallback.
- **Routes namespaced** under `apps/web/app/api/auth/buildbase/{token,session,logout,workspace-token}`
  to avoid colliding with the existing admin auth routes.
- **Server factory:** `apps/web/src/server/tenancy/buildbase.ts` → `getBuildbase()` (lazy, guarded —
  never throws with empty creds). Use `getBuildbase()?.auth()/.workspace/.usage/.features/.notification`.
- **Provider guard:** `BuildbaseProvider` renders children WITHOUT the SDK when `NEXT_PUBLIC_SAAS_ORG_ID`
  is empty, so the app runs on the existing admin auth until creds are supplied.
- **GraphQL `ctx.tenancy`** is resolved from the `bb-workspace-token` JWT cookie (verified with
  `SYSTEM_SECRET`) because the Yoga context serves HTTP **and** WS, where `next/headers cookies()`
  isn't available. This is the skill's endorsed "app-specific workspace token" pattern.

## Gotchas
- `BuildBase({ orgId: "" })` may throw — construct the factory **lazily** and only when configured.
- `orgId` must be a 24-char hex (Mongo ObjectId).
- Agents never call buildbase (they use `apiKeyHash`). Only human request paths touch buildbase.
- Cache `auth()`/role/quota per request; don't call buildbase in a hot loop.
