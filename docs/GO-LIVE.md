# Production Go‑Live Checklist

End‑to‑end, actionable checklist for taking a deployment live. Every command matches the repo's real
scripts (`package.json`, `apps/web/package.json`, `turbo.json`) and configs. Env rules are taken
verbatim from `apps/web/src/server/env.ts`; flag defaults from `packages/utils/src/feature-flag-keys.ts`.

Work top‑to‑bottom: **Environment → Database → Feature flags → Deploy → Smoke tests → Rollback.**

---

## 1. Environment variables

`apps/web/src/server/env.ts` validates env at boot. In production runtime (`NODE_ENV=production`, not
the `next build` phase) it uses the **strict** schema and **fails hard** if any required var is missing
or weak. During `next build` it uses a lenient schema (secrets aren't needed to compile).

### Required (production boot fails without these)

| Var | Rule (from `env.ts`) | Purpose | Example |
|-----|----------------------|---------|---------|
| `POSTGRES_PRISMA_URL` | non‑empty | Pooled Postgres connection (app runtime) | `postgresql://user:pass@host:5432/agentcenter?pgbouncer=true` |
| `POSTGRES_URL_NON_POOLING` | non‑empty | Direct Postgres connection (migrations, `pg_dump`) | `postgresql://user:pass@host:5432/agentcenter` |
| `AUTH_SECRET` | ≥ 16 chars, **must not** equal `mc-dev-secret-change-in-production` | Signs session tokens | `openssl rand -hex 32` |
| `CRON_SECRET` | non‑empty | Authenticates the cron endpoints + license refresh | `openssl rand -hex 32` |
| `SECRET_ENCRYPTION_KEY` | ≥ 32 chars (enforced by an explicit production check, not the zod field) | AES‑256‑GCM master key for the secrets vault; boot throws if missing/weak in prod | `openssl rand -hex 32` |

> Without `SECRET_ENCRYPTION_KEY` (≥32) in production the app throws at startup — it will not serve a
> single request. Generate and set it before first boot.

### Optional (each unlocks a feature; safe to omit)

| Var | Default | Unlocks / effect |
|-----|---------|------------------|
| `REDIS_URL` | — | Real‑time pub/sub + caching. Absent → `/api/health` reports `redis: skip`; live features degrade |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | — | Cloudflare R2 file storage for deliverables/uploads (all three needed together) |
| `R2_BUCKET_NAME` | `mnc` | R2 bucket name |
| `R2_PREFIX` | `""` | Key prefix within the bucket |
| `RESEND_API_KEY` | — | Email notifications via Resend |
| `NOTIFICATION_FROM_EMAIL` | — | From‑address for those emails (validated as email if set) |
| `LICENSE_SERVER_URL` | `https://admin.app.agentcenter.cloud` | License validation server |
| `LICENSE_REFRESH_TOKEN` | — | Hosted clients get this injected; its **absence** marks the deploy as self‑hosted |
| `LICENSE_PUBLIC_KEY` | bundled/fetched | Verify signed license payloads |
| `NEXT_PUBLIC_MC_URL` | — | Public base URL of the app (links, redirects) |
| `DEPLOYMENT_WEBHOOK_BASE_URL` | — | Callback base for cloud‑deploy webhooks (validated URL) |
| `SSH_KEY_ENCRYPTION_SECRET` | — | Encrypts stored SSH keys for host provisioning |
| `SUPPORT_EMAIL` | `dharmendra@agentcenter.cloud` | Support contact surfaced in‑app |
| `SLACK_SUPPORT_WEBHOOK_URL` | — | Route support messages to Slack |

Notes carried from `env.ts`:

- **Sandbox / cloud‑provider credentials are NOT deployment env.** Every cloud sandbox and host
  provider (E2B, Modal, Daytona, Novita, Cloudflare, Kubernetes, Hetzner, …) reads its credentials
  **from the workspace's own secrets vault** by secret name — there are intentionally no provider env
  vars here.
- `LICENSE_DEV_BYPASS` is a **dev/CI‑only** escape hatch (guarded to non‑prod build or CI). **Never set
  it on a real production server.**

Validate before boot:

```bash
npm run operator env:check     # ✓/✗ for POSTGRES_*, AUTH_SECRET, CRON_SECRET (+ optional info)
npm run doctor                 # env + DB connectivity + migration status; exits non-zero to gate a deploy
```

`operator env:check` treats `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `AUTH_SECRET`,
`CRON_SECRET` as required and `SECRET_ENCRYPTION_KEY`, `REDIS_URL`, `R2_*`, `RESEND_API_KEY` as optional.

---

## 2. Database

The app is Prisma/Postgres. Migrations are the **real chain** (`migrate deploy`), never `db push`, so
raw‑SQL migration artifacts (seed rows, partial indexes, backfills) land.

```bash
# 1. generate the Prisma client (also emits the Pothos generated types)
cd packages/database && npx prisma generate && cd ../..

# 2. back up first (timestamped SQL under ./backups; prunes to newest 14 by default)
npm run db:backup -- --gzip            # or: npm run operator db:backup -- --gzip
#   flags pass through to scripts/db-backup.mjs:
#     --out DIR   write elsewhere   --keep N   retention (0 = never prune)
#   reads POSTGRES_URL_NON_POOLING (direct) and requires pg_dump on PATH

# 3. apply migrations
npm run db:migrate:deploy              # root → packages/database (prisma migrate deploy)

# 4. confirm
npm run operator db:migrate:status     # applied / pending
```

On the self‑hosted Docker image, migrations run **automatically** at container start via
`apps/web/docker-entrypoint.sh` (`migrate deploy`, with P3005/P3009/P3018 recovery paths). A destructive
`db push` fallback is **opt‑in only** — set `ALLOW_DB_PUSH_FALLBACK=true` solely to recover a
mis‑provisioned DB.

Restore procedure: see `scripts/RESTORE.md`.

---

## 3. Feature‑flag rollout plan

Flags are the control surface for the release. Defaults ship in
`packages/utils/src/feature-flag-keys.ts` (`FLAG_DEFAULTS`) and are seeded on startup. At runtime a
flag is on when the DB row is enabled **and** (no license configured, or the license grants it). Enable
flags **incrementally**: get the core surface healthy, then light up operator/advanced areas one wave
at a time, smoke‑testing each (see §5).

### Defaults today

**On by default (29)** — the core product; verify they're on, no action needed:

`channels`, `analytics`, `recurring_tasks`, `reviews`, `documents`, `agent_queue`, `notifications`,
`governance`, `budgets`, `ledger`, `secrets_vault`, `pipelines_routines`, `task_autonomy`, `cases`,
`skills_teams`, `workspace_portability`, `goals`, `observability`, `api_keys`, `agent_instructions`,
`org_chart`, `attention`, `agent_authz`, `task_relations`, `external_links`, `annotations`, `voting`,
`monitors`, `ai_tools`.

**Off by default (34)** — opt‑in; enable per the waves below:

`live_gateway`, `multi_provider_adapters`, `secret_proposals`, `board_chat`, `plugin_sdk`, `terminals`,
`runners`, `memory`, `environments`, `execution_policy`, `execution_workspaces`, `custom_images`,
`low_trust_review`, `work_products`, `provider_quota`, `thread_interactions`, `agent_companies`,
`feedback`, `folders`, `continuation_summaries`, `decision_training`, `inbox_policy`,
`tool_runtime_metrics`, `plugin_runtime`, `assets`, `productivity_review`, `external_objects`,
`cloud_upstreams`, `provider_auth`, `local_services`, `smoke_lab`, `telemetry`, `adapter_plugins`,
`artifacts`.

### Recommended incremental enablement order

| Wave | Enable | Rationale |
|------|--------|-----------|
| **0 — core (verify on)** | the 29 default‑on flags | ship this first; the base product surface |
| **1 — low‑risk content surfaces** | `feedback`, `folders`, `artifacts`, `assets`, `work_products`, `thread_interactions`, `board_chat`, `multi_provider_adapters`, `terminals` | additive UI/content; no infra dependency (OpenClaw adapter works without `multi_provider_adapters`) |
| **2 — governance / operator surfaces** | `secret_proposals`, `low_trust_review`, `inbox_policy`, `provider_quota`, `provider_auth`, `adapter_plugins`, `decision_training`, `productivity_review`, `telemetry`, `tool_runtime_metrics` | policy/governance layers on top of core; enable once ops workflows are ready |
| **3 — advanced execution (needs infra)** | `live_gateway`, `runners`, `memory`, `environments`, `execution_policy`, `execution_workspaces`, `custom_images`, `plugin_sdk`, `plugin_runtime`, `local_services`, `cloud_upstreams`, `external_objects`, `smoke_lab`, `agent_companies`, `continuation_summaries` | require runners/sandbox providers, Redis (live gateway), and workspace secrets to be provisioned first |

Toggle flags from the admin UI (Feature Flags), or seed a row directly (the startup migration is
create‑only and won't overwrite an existing row — the E2E job uses `SEED_ENABLE_RUNNERS=1` this way).
After a direct SQL change, the 60s cache clears on its own, or call the invalidate path.

---

## 4. Deploy

Two supported paths. Both run migrations and require the §1 env.

### Path A — Vercel (managed)

Mirrors `.github/workflows/vercel.yaml` (a `workflow_dispatch` deploy):

```bash
cd apps/web
npx vercel pull --yes --environment=production --token=$VERCEL_TOKEN
npx prisma generate
npx vercel build --prod --token=$VERCEL_TOKEN                 # NODE_OPTIONS=--max-old-space-size=8192
set -a && source .vercel/.env.production.local && npx prisma migrate deploy
npx vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN
```

Set the §1 env vars in the Vercel project (Production scope) before deploying. Backing Postgres is
typically Supabase (pooled `POSTGRES_PRISMA_URL` + direct `POSTGRES_URL_NON_POOLING`); see
`apps/web/DEPLOYMENT.md`.

### Path B — Self‑hosted Docker (published image)

Image: `ghcr.io/missioncontrolsquad/agentcenter:latest` (`linux/amd64` + `linux/arm64`), built from
`apps/web/Dockerfile`, published by `.github/workflows/docker-publish.yaml`. Compose files live in
`apps/web/self-hosted/`.

```bash
mkdir agentcenter && cd agentcenter
# copy apps/web/self-hosted/docker-compose.yml and .env.example here
cp .env.example .env
# edit .env — set PG_PASS, REDIS_PASS, AUTH_SECRET, CRON_SECRET, PUBLIC_URL (all required)
docker compose up -d
```

`docker-compose.yml` runs Postgres 16 + Redis 7 + the app (read‑only rootfs, dropped caps, healthcheck
on `/api/health`). The entrypoint runs `migrate deploy` automatically at start. Full guide:
`apps/web/self-hosted/SETUP.md`. There is also `docker-compose.prod.yml` and a buildbase overlay
(`docker-compose.buildbase.yml`).

> The self‑hosted image bundles a WebSocket server (`server.cjs`) for GraphQL subscriptions + the Live
> Gateway. `SECRET_ENCRYPTION_KEY` must be ≥32 chars — the compose `.env.example` omits it, so **add it**
> if you enable the secrets vault against the image directly (verify in your environment).

### Cron registration

`apps/web/vercel.json` registers four crons (Vercel schedules them automatically; self‑hosted needs an
external scheduler hitting these paths with the `CRON_SECRET`):

| Path | Schedule |
|------|----------|
| `/api/cron/cleanup-live-gateway` | `0 * * * *` (hourly) |
| `/api/cron/reap-stale-work` | `*/5 * * * *` (every 5 min) |
| `/api/cron/auto-sleep` | `*/15 * * * *` (every 15 min) |
| `/api/cron/run-sandbox-queue` | `* * * * *` (every minute) |

### Operator CLI

```bash
npm run operator doctor              # env + DB connectivity + migration status (read-only; gates deploy)
npm run operator env:check           # required-vars checklist
npm run operator db:backup -- --gzip # pg_dump → ./backups
npm run operator db:migrate:status   # applied / pending migrations
npm run operator service:install     # render a launchd/systemd unit for the standalone runner daemon
npm run operator service:status      # runner service status
```

`service:*` manages the standalone `@agentcenter/runner` daemon (login service; macOS launchd / Linux
systemd). `service:install` prints the unit unless you pass `-- --write`; `service:uninstall` refuses
without `-- --force`. Exit codes propagate so any of these can gate a deploy step.

---

## 5. Smoke tests after deploy

Run these against the live URL (`$BASE` = your deployed origin):

```bash
# 1. Health — expect HTTP 200 and "status":"healthy" (503/"unhealthy" means DB is down)
curl -sS $BASE/api/health | jq '.status, .checks.database.status, .checks.redis.status'
```

2. **Login** — open `$BASE`, sign in with the admin account (first boot: complete the one‑time admin
   setup; the seeded fixture uses `admin` / `securepass123`, change it for production).

3. **Create‑agent → first‑task happy path** — create an agent, assign it a task, confirm it moves
   through the queue and produces activity/output. (This mirrors `apps/web/tests/e2e/full-flow.test.ts`
   and the browser spec `e2e/specs/agent-lifecycle.spec.ts`.)

4. **Flag gate** — enable one Wave‑1 flag (e.g. `artifacts` or `feedback`) in the admin Feature Flags
   page, reload, and confirm the newly gated page/section renders. Then disable it and confirm it
   disappears — this proves the flag control plane end‑to‑end before you roll further waves.

5. **License** (self‑hosted) — activate the license and confirm licensed features report available.

---

## 6. Rollback

| Situation | Action |
|-----------|--------|
| A feature is misbehaving | **Disable its flag** in the admin Feature Flags page (or set the row `enabled=false`). Instant, no redeploy; the ≤60s cache clears on its own. This is the first and safest lever. |
| Bad migration | Restore from the pre‑deploy backup (`scripts/RESTORE.md`) using the newest `./backups/agentcenter-*.sql[.gz]`. Prisma migrations are additive; author reversals per the migration‑safety practice rather than editing applied migrations. |
| Bad app build (Vercel) | Promote the previous deployment in the Vercel dashboard (instant rollback), or `npx vercel deploy` the prior commit. |
| Bad image (self‑hosted) | Pin `APP_VERSION` to the last good tag in `.env` and `docker compose up -d` (the app image is versioned `ghcr.io/missioncontrolsquad/agentcenter:<version>`). |
| Runner daemon wedged | `npm run operator service:restart` (or `service:stop`, then investigate with `service:logs -- --lines 200`). |

Always `npm run db:backup -- --gzip` **before** a migration or image bump so a rollback has a restore point.

---

See also: [TESTING.md](./TESTING.md) for running the suite and reproducing CI locally.
