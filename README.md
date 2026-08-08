# AgentCenter

Self-hosted AI agent management platform. Orchestrate, schedule, and monitor AI agents from a single dashboard.

## Self-Hosted Quick Start

```bash
mkdir agentcenter && cd agentcenter

# Place the provided docker-compose.yml and .env.example in this directory

# Configure
cp .env.example .env
# Edit .env — set PG_PASS, AUTH_SECRET, CRON_SECRET, PUBLIC_URL

# Start
docker compose up -d
```

Open `http://localhost:3000`, activate your license, and create your admin account.

Full setup guide: [apps/web/self-hosted/SETUP.md](apps/web/self-hosted/SETUP.md)

## What's Included

The Docker Compose setup runs three services:

- **PostgreSQL 16** — application database
- **Redis 7** — real-time pub/sub and caching
- **AgentCenter App** — Next.js dashboard with REST API, GraphQL, and WebSocket support

## Requirements

| Requirement | Minimum |
|-------------|---------|
| Docker | v20.10+ |
| Docker Compose | v2.0+ |
| RAM | 2 GB |
| Disk | 10 GB |

A **license key** is required to activate the app — purchase at [agentcenter.cloud](https://agentcenter.cloud).

## Docker Image

```bash
docker pull ghcr.io/missioncontrolsquad/agentcenter:latest
```

Available for `linux/amd64` and `linux/arm64`.

## Operator CLI

`npm run operator <command>` is a small admin surface for running and diagnosing a deployment. Each
command is a thin wrapper over the tool that already owns the work (it does not reimplement backup or
migration logic), and its exit code is propagated so it can gate a deploy in CI.

```bash
npm run operator doctor              # environment + DB connectivity + migration status (read-only)
npm run operator env:check           # validate required env vars are set (POSTGRES_*, AUTH_SECRET, CRON_SECRET)
npm run operator db:backup -- --gzip # pg_dump the database to ./backups (flags pass through to scripts/db-backup.mjs)
npm run operator db:migrate:status   # show applied / pending Prisma migrations
npm run operator help                # list commands
```

Wraps `scripts/doctor.mjs`, `scripts/db-backup.mjs`, and `prisma migrate status`. Pass args to the
underlying script after ` -- ` (e.g. `db:backup -- --out /backups --keep 7`).

## Documentation

- [Self-Hosted Setup Guide](apps/web/self-hosted/SETUP.md) — full installation, HTTPS, backups, troubleshooting
- [Deployment Guide](apps/web/DEPLOYMENT.md) — Vercel deployment with Supabase

## License

Proprietary. See [agentcenter.cloud](https://agentcenter.cloud) for licensing.
