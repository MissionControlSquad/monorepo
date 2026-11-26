# Contributing

Thanks for your interest. This is the AgentCenter monorepo: the Next.js web app and API
(`apps/web`), the Electron desktop app (`apps/desktop`), the mobile app (`apps/mobile`) and the
shared packages under `packages/` (Prisma schema, GraphQL server and client, runner, types, utils).

## Ground rules

- Everyone taking part agrees to the [Code of Conduct](CODE_OF_CONDUCT.md).
- Security problems go through [private reporting](SECURITY.md), never a public issue or pull request.
- For anything larger than a fix, start a [discussion](https://github.com/MissionControlSquad/monorepo/discussions)
  or open an issue first so the approach is agreed before you build it.

## Development setup

Requirements: Node.js 22 (see `.nvmrc`), npm, PostgreSQL 16 and Redis 7. The easiest way to get the
databases is the Compose file in `apps/web/self-hosted/`, or any local install.

```bash
npm ci
cp apps/web/.env.example apps/web/.env   # point the POSTGRES_* and REDIS_URL values at your databases
npm run db:generate
npm run db:migrate
npm run dev
```

Set `LICENSE_DEV_BYPASS=1` in `apps/web/.env` for local development; it only takes effect outside
production builds. See [Project status](README.md#project-status) for why.

## Before you open a pull request

Run the same checks CI runs (`.github/workflows/test.yaml`):

```bash
npx turbo run typecheck
npx turbo run test        # needs Postgres + Redis and apps/web/.env.test
npx turbo run build --filter=@agentcenter/web
```

- Add or update tests next to the code you change.
- Schema changes need a Prisma migration in `packages/database`.
- If you add or rename an environment variable, update `apps/web/.env.example` and the docs.
- New GitHub Actions must be pinned to a full commit SHA, with the narrowest `permissions` the job needs.

## Never commit secrets

`.env`, `.env.local` and `.env.test` are git-ignored. Example values must be obvious placeholders and
test fixtures must use clearly fake keys. Secret scanning with push protection is enabled and blocks
pushes that contain recognised credentials.

## Commits and review

Use [Conventional Commits](https://www.conventionalcommits.org/) (`fix:`, `feat:`, `docs:`, `chore:`).
Every change lands through a pull request that passes CI and is reviewed by a code owner. Pull
requests are squash-merged, so the PR title becomes the commit message.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
