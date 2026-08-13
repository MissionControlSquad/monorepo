# Self-Hosting AgentCenter with buildbase (single-tenant)

How to run **one** AgentCenter install on your own infrastructure, authenticated by **your buildbase
org**, as a **single-tenant** deployment. This is the self-host counterpart to the hosted, multi-tenant
`*.app.agentcenter.cloud` model. Env rules below are taken from `apps/web/src/server/env.ts`; the auth
behaviour from `apps/web/src/server/auth/buildbase-bridge.ts` + `apps/web/src/server/tenancy/resolve.ts`;
the hosted binding it contrasts with from `infra/templates/client.yml`.

> **In one line:** set the buildbase config, leave `TENANT_WORKSPACE_ID` **unset**, and every
> authenticated user of your buildbase org signs in as **owner** of the single default workspace.

---

## 1. What "self-host + buildbase" means

- **One** AgentCenter install (app + its own Postgres/Redis) on your own infra.
- **buildbase is the identity provider.** Users sign in with your buildbase org; AgentCenter mints its
  own `mc_session` from the verified buildbase session (the *auth bridge*).
- **Single-tenant.** There is exactly one AgentCenter workspace — `DEFAULT_WORKSPACE_ID` (default
  `ws_default`). Every authenticated buildbase-org user operates in it.
- **No landing site, no cross-subdomain SSO.** Unlike the hosted tier (a shared `bb-session-id` cookie
  across `*.agentcenter.cloud` that SSOs from a landing site into a per-tenant subdomain), self-host is a
  **single host** using the direct OAuth login flow. Nothing is shared across domains.

### Self-host vs. hosted, at a glance

|  | **Self-host (this doc)** | **Hosted (`*.app.agentcenter.cloud`)** |
|---|---|---|
| `TENANT_WORKSPACE_ID` | **UNSET** | set to the tenant's bound buildbase workspace id |
| Membership gate | **none** — any org user admitted | required; non-members denied (fail-closed) |
| Tenancy resolution | `DEFAULT_WORKSPACE_ID`, role **owner** | pinned to the bound workspace, buildbase-reported role |
| `bb-workspace-token` cookie | **not set** (nothing to pin) | set, pinned to `TENANT_WORKSPACE_ID` |
| `AUTH_COOKIE_DOMAIN` | **UNSET** (host-only cookie) | `.agentcenter.cloud` (cross-subdomain SSO) |
| Login | direct OAuth on the install URL | landing-site SSO → tenant subdomain |

---

## 2. Required environment

### 2.1 Always-required app env (self-host or not)

From `apps/web/src/server/env.ts` — in production runtime (`NODE_ENV=production`) the app **fails to boot**
without these:

| Var | Rule | Purpose |
|-----|------|---------|
| `POSTGRES_PRISMA_URL` | non-empty | Pooled Postgres connection (app runtime) |
| `POSTGRES_URL_NON_POOLING` | non-empty | Direct Postgres connection (migrations, backups) |
| `AUTH_SECRET` | ≥ 16 chars, **not** `mc-dev-secret-change-in-production` | Signs `mc_session` tokens |
| `CRON_SECRET` | non-empty | Authenticates the cron endpoints |
| `SECRET_ENCRYPTION_KEY` | ≥ 32 chars (enforced by an explicit prod check at boot) | AES-256-GCM master key for the secrets vault |

Generate secrets with `openssl rand -hex 32`.

### 2.2 buildbase config (what turns on human auth)

All are declared **optional** in `env.ts` (so a no-buildbase deploy still works), but for a self-host
install **that uses buildbase for login** you need the full set. Setting `SAAS_ORG_ID` /
`NEXT_PUBLIC_SAAS_ORG_ID` is what activates the human-tenancy plane (sign-in, workspaces, roles).

| Var | Purpose |
|-----|---------|
| `SAAS_SERVER_URL` | buildbase API base URL (server). Defaults to `https://api.console.buildbase.app` if unset; point it at your own tenant-server for a bundled buildbase |
| `NEXT_PUBLIC_SAAS_SERVER_URL` | Same URL for the client SDK |
| `SAAS_ORG_ID` | **Activator (server).** Your buildbase org id (24-char hex) for the server `BuildBase()` factory |
| `NEXT_PUBLIC_SAAS_ORG_ID` | **Activator (client).** Same org id; presence mounts `SaaSOSProvider` and the sign-in UI |
| `SAAS_CLIENT_ID` | OAuth client id (server code exchange) |
| `NEXT_PUBLIC_SAAS_CLIENT_ID` | OAuth client id (client redirect) |
| `SAAS_CLIENT_SECRET` | OAuth client **secret** for the server-side `/api/auth/buildbase/token` code exchange |
| `NEXT_PUBLIC_APP_URL` | Public URL of **this** install — the OAuth `redirectUrl` / callback |
| `SYSTEM_SECRET` | Signs the internal workspace/identity JWTs the auth bridge issues. Required whenever buildbase auth is on |

> `SAAS_SERVER_URL` / `NEXT_PUBLIC_SAAS_SERVER_URL` are optional **only** because the code falls back to
> the buildbase cloud default. Set them explicitly if you run a bundled/local buildbase.

### 2.3 Do NOT set these on a self-host install

- **`TENANT_WORKSPACE_ID` — leave UNSET.** This is the switch. Unset ⇒ single-tenant: no membership
  gate, any authenticated org user is admitted, and `resolveTenancy` grants `DEFAULT_WORKSPACE_ID` as
  `owner`. Setting it flips the install into the hosted, workspace-gated mode (see §6). In
  `infra/templates/client.yml` the hosted tenants set it per-container; a self-host box does not.
- **`AUTH_COOKIE_DOMAIN` — leave UNSET.** It exists to share the `mc_session` cookie across subdomains
  for the hosted landing→dashboard SSO. On a single host there is nothing to share; leaving it unset
  gives the correct host-only cookie.

### 2.4 Minimal self-host `.env` (buildbase login)

```dotenv
# ── Always-required app env ──────────────────────────────
POSTGRES_PRISMA_URL=postgresql://user:pass@host:5432/agentcenter?pgbouncer=true
POSTGRES_URL_NON_POOLING=postgresql://user:pass@host:5432/agentcenter
AUTH_SECRET=<openssl rand -hex 32>
CRON_SECRET=<openssl rand -hex 32>
SECRET_ENCRYPTION_KEY=<openssl rand -hex 32>   # >=32 chars

# ── buildbase (human auth) ───────────────────────────────
SAAS_SERVER_URL=https://api.console.buildbase.app
NEXT_PUBLIC_SAAS_SERVER_URL=https://api.console.buildbase.app
SAAS_ORG_ID=<your 24-char hex org id>
NEXT_PUBLIC_SAAS_ORG_ID=<your 24-char hex org id>
SAAS_CLIENT_ID=<oauth client id>
NEXT_PUBLIC_SAAS_CLIENT_ID=<oauth client id>
SAAS_CLIENT_SECRET=<oauth client secret>
NEXT_PUBLIC_APP_URL=https://agentcenter.your-domain.com
SYSTEM_SECRET=<openssl rand -hex 32>

# ── Do NOT set on self-host ──────────────────────────────
# TENANT_WORKSPACE_ID=   ← leave unset (single-tenant; any org user = owner)
# AUTH_COOKIE_DOMAIN=    ← leave unset (single host; no cross-subdomain SSO)
```

---

## 3. The login flow (self-host)

1. A user opens the install URL (`NEXT_PUBLIC_APP_URL`).
2. Unauthenticated → they land on **`/login`**.
3. They click **"Continue with Buildbase"** → `useSaaSAuth().signIn()` redirects to the buildbase OAuth
   screen for your org.
4. buildbase redirects back with a `code`; the client posts it to **`POST /api/auth/buildbase/token`**.
5. That route exchanges the code with buildbase, and the **auth bridge**
   (`bridgeBuildbaseSession`) upserts a local `Profile` and mints the app's **`mc_session`** cookie.
6. The user is in — operating as **owner** of the default workspace.

There is **no landing site** and **no shared-cookie SSO** hop. It's a single OAuth round-trip on one host.

---

## 4. Authorization model in self-host

With `TENANT_WORKSPACE_ID` unset:

- The auth bridge performs **no membership check** — `bridgeBuildbaseSession` returns `granted` with an
  **empty** `workspaceToken` (nothing to pin), so no `bb-workspace-token` cookie is set.
- `resolveTenancy` takes its bootstrap fallback: a valid `mc_session` → `DEFAULT_WORKSPACE_ID` with role
  **owner**. (In hosted mode this exact fallback is refused — see §5.)
- **The first authenticated user provisions local ownership** (idempotent); thereafter every
  authenticated org user also enters the same single workspace as owner.

**Consequence — access = "anyone in the buildbase org".** There is no per-user allow-list in AgentCenter
itself. To restrict *who* can get in, choose one of:

1. **Use a dedicated buildbase org** for this install and only invite intended users to it, **or**
2. **Turn on workspace gating** — set `TENANT_WORKSPACE_ID` to a specific workspace and add only the
   intended people as members of that workspace in buildbase (see §6).

---

## 5. Lockout warning (buildbase is the only auth)

There is **no password fallback**. Production/dev auth is buildbase-only — there is no local login route.
That means:

- A **valid `SAAS_CLIENT_SECRET`** and a **reachable `SAAS_SERVER_URL`** are **mandatory**. If the client
  secret is wrong or buildbase is unreachable, the code exchange fails and **no one can sign in**.
- `SYSTEM_SECRET` must be set; without it the bridge cannot mint sessions.
- Misconfiguration = full lockout. Validate the buildbase config **before** cutting over, and keep a
  known-good `.env` to roll back to.

> The in-process test-session mint (`mintTestSessionToken`) is **strictly CI-only** — it is gated to
> `NODE_ENV=test`. It is **not** a production recovery path; do not rely on it to get back in.

---

## 6. Optional hardening — workspace gating

If you want the single-tenant install to admit **only members of a specific buildbase workspace** (rather
than anyone in the org), set:

```dotenv
TENANT_WORKSPACE_ID=<the buildbase workspace id to gate on>
```

This flips the install into the **hosted / workspace-gated** posture:

- The auth bridge verifies (against buildbase) that the signing-in user is a **member** of that workspace,
  resolves their **buildbase-reported role** (owner/admin/member/viewer), and pins a `bb-workspace-token`
  to it. **Non-members are denied** — no `mc_session`, no access (fail-closed).
- `resolveTenancy` then resolves tenancy from that pinned token and **refuses** the `DEFAULT_WORKSPACE_ID`
  fallback for a bare `mc_session`.
- `SYSTEM_SECRET` becomes load-bearing for the pin (a grant is denied as `misconfigured` without it).

Add only the intended people as members of that workspace in buildbase, and manage access there. This is
the same code path the hosted multi-tenant containers use; you're simply running one of them yourself.

---

## Related

- `docs/GO-LIVE.md` — full production go-live checklist (env, DB, flags, deploy, rollback).
- `docs/deployment/self-hosting.mdx` — the self-host + billing/licensing model (two-org design).
- `apps/web/self-hosted/SETUP.md` — Docker Compose self-host setup, incl. the buildbase overlay.
- Auth internals: `apps/web/src/server/auth/buildbase-bridge.ts`,
  `apps/web/src/server/tenancy/resolve.ts`.
- Tests: `apps/web/tests/integration/buildbase-selfhost.test.ts` (self-host e2e),
  `apps/web/tests/integration/buildbase-bridge.test.ts` (hosted e2e),
  `apps/web/tests/unit/buildbase-bridge.test.ts`.
