# AgentCenter

[![CI](https://github.com/MissionControlSquad/monorepo/actions/workflows/test.yaml/badge.svg)](https://github.com/MissionControlSquad/monorepo/actions/workflows/test.yaml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Self-hosted AI agent management platform. Orchestrate, schedule, and monitor AI agents from a single dashboard.

## Project status

The hosted AgentCenter app service and its license server have been shut down, and this repository is
now open source under the [MIT License](LICENSE). It is provided as-is and maintained on a best-effort
basis.

> [!WARNING]
> The app still checks a license against the shut-down license server (`LICENSE_SERVER_URL`, see
> [`apps/web/src/server/license.ts`](apps/web/src/server/license.ts)). Until that gate is removed or
> replaced, new self-hosted installations can't be activated and existing ones stop working once their
> cached license expires (3-day grace period). Contributions that remove the gate are welcome.

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

The app currently asks for a **license key** on first start; see [Project status](#project-status).

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

It also manages the standalone runner daemon (`@agentcenter/runner`) - installing it, running it as
a login service, and updating it. `install` / `update` only print copy-pasteable steps, and
`service:install` prints the unit by default and `service:uninstall` refuses without `--force`;
nothing privileged or destructive runs without an explicit flag.

```bash
npm run operator install                  # print managed-install steps (npm i -g / npx) + login hint
npm run operator update                   # print the self-update hint (npm update -g)
npm run operator service:install          # render the launchd (macOS) / systemd (Linux) unit
npm run operator service:install -- --write  # write the unit to the user path (the only fs write)
npm run operator service:start            # launchctl load / systemctl --user start
npm run operator service:stop             # launchctl unload / systemctl --user stop
npm run operator service:restart          # stop then start (launchctl reload / systemctl --user restart)
npm run operator service:status           # launchctl list / systemctl --user status
npm run operator service:health           # probe active state (launchctl list / systemctl is-active)
npm run operator service:logs -- --lines 200 --follow  # tail journalctl / the plist StandardOut/Err logs
npm run operator service:uninstall -- --force  # stop + remove the unit file (refuses without --force)
```

The platform is auto-detected: macOS gets a `~/Library/LaunchAgents` plist driven by `launchctl`,
Linux gets a `~/.config/systemd/user` unit driven by `systemctl --user`.

Wraps `scripts/doctor.mjs`, `scripts/db-backup.mjs`, and `prisma migrate status`. Pass args to the
underlying script after ` -- ` (e.g. `db:backup -- --out /backups --keep 7`).

## Documentation

- [Self-Hosted Setup Guide](apps/web/self-hosted/SETUP.md) — full installation, HTTPS, backups, troubleshooting
- [Deployment Guide](apps/web/DEPLOYMENT.md) — Vercel deployment with Supabase

## Contributing

Read [the Code of Conduct](CODE_OF_CONDUCT.md) first. Ask questions and propose ideas in
[Discussions](https://github.com/MissionControlSquad/monorepo/discussions); file reproducible bugs as
[issues](https://github.com/MissionControlSquad/monorepo/issues/new/choose). Pull requests go against
`main` and must pass CI (typecheck, tests and the web build) and a code owner's review. See
[SUPPORT.md](.github/SUPPORT.md) for where each kind of request goes.

## Security

Please don't report vulnerabilities in public issues. Use
[private vulnerability reporting](https://github.com/MissionControlSquad/monorepo/security/advisories/new);
details are in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Jagodana LLC. `packages/runner` and `packages/mc-bridge-plugin` carry their own
MIT license files.
