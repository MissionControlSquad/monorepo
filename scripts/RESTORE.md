# Database Backup & Restore Runbook

## Backups

Create a backup (writes a timestamped dump under `./backups`):

```bash
npm run db:backup                 # plain .sql
npm run db:backup -- --gzip       # gzipped
npm run db:backup -- --out /var/backups/agentcenter --keep 30
```

- Reads the **direct (non-pooled)** connection string (`POSTGRES_URL_NON_POOLING`).
- Exits non-zero on failure — safe to gate a deploy on.
- **Retention:** keeps the newest `--keep N` backups (default **14**) in the output dir and prunes older
  ones. `--keep 0` disables pruning. A prune failure never fails the dump itself.

### Scheduling (recommended for self-host)

Run daily via cron (host crontab or a compose sidecar):

```cron
0 3 * * *  cd /app && npm run db:backup -- --gzip --out /var/backups/agentcenter --keep 30 >> /var/log/agentcenter-backup.log 2>&1
```

On Vercel/managed Postgres, prefer the provider's automated point-in-time backups; `db:backup` is a
supplementary logical dump.

## Restore

> ⚠️ A restore **overwrites** the target database. Take a fresh `db:backup` of the current (broken) state
> first if you may need to inspect it.

1. Stop the app (so nothing writes mid-restore):
   ```bash
   docker compose -f apps/web/self-hosted/docker-compose.prod.yml stop web
   ```
2. Restore into a clean database (use the **direct** URL):
   ```bash
   # plain .sql
   psql "$POSTGRES_URL_NON_POOLING" < backups/agentcenter-<stamp>.sql
   # gzipped
   gunzip -c backups/agentcenter-<stamp>.sql.gz | psql "$POSTGRES_URL_NON_POOLING"
   ```
   For a from-scratch restore, drop/recreate the schema first:
   ```bash
   psql "$POSTGRES_URL_NON_POOLING" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
   ```
3. Bring the schema to the app's expected state (idempotent no-op if the dump was current):
   ```bash
   cd packages/database && npx prisma migrate deploy
   ```
4. Start the app and verify readiness:
   ```bash
   docker compose ... up -d web
   curl -fsS http://localhost:3000/api/health   # must return 200 with database:{status:"pass"}
   ```

## Migration rollback

Prisma migrations are **forward-only** (no down-migrations). To recover from a bad migration:

- **Preferred:** restore the last good `db:backup` (above), then deploy the fixed migration.
- Adopt **expand/contract** for destructive changes (add nullable → backfill → drop in a *later* release)
  so a rollback never needs a dropped column back.
- Never rely on the entrypoint's `db push` fallback for recovery — it is opt-in
  (`ALLOW_DB_PUSH_FALLBACK=true`) precisely because `--accept-data-loss` can drop drifted columns.
