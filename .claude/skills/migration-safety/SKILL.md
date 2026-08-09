---
name: migration-safety
description: >
  The safe, reversible way to author any AgentCenter database migration — additive-first, backfill,
  tighten, rollback. Use whenever adding/changing a Prisma schema and generating a migration. Must
  pass the repo migration-safety lint and run on a seeded DB.
---

# Migration safety

Every migration is **additive-first, backfilled, then tightened, always reversible.**

## The 6 rules

1. **Additive first.** New columns land **nullable or with a default**. Never add a `NOT NULL` column
   without a default to a **populated** table in one step. (Brand-new tables may be `NOT NULL` at
   create — no existing rows to violate.)
2. **Backfill** as a documented, **idempotent** SQL/seed step (safe to re-run; use `ON CONFLICT DO
   NOTHING` or an idempotency key). Never query tables that don't exist (`organizations`,
   `org_memberships` do NOT exist in AgentCenter).
3. **Tighten** to `NOT NULL` only in a **follow-up** migration, after verifying zero NULLs.
4. **Rollback** documented for every migration: `pnpm prisma migrate resolve --rolled-back <name>` +
   `DROP` in FK-safe order (children first) + drop enums + remove back-relations + `prisma generate`.
5. Must pass the repo **migration-safety lint** and run **start-to-finish on a seeded DB**.
6. **`workspaceId` backfill** (single-tenant install): set all existing rows to the default workspace id
   supplied by the backfill runner — never `SELECT id FROM organizations`.

## Recipe

```bash
cd packages/database
pnpm prisma migrate dev --name add_<feature> --create-only   # review SQL before applying
# (edit the generated migration.sql to append idempotent backfill if needed)
pnpm prisma migrate dev            # apply locally; prod: pnpm prisma migrate deploy
pnpm prisma generate
```

Two-step tighten when adding a required column to a populated table:
```bash
pnpm prisma migrate dev --name add_<col>_nullable   # step 1: nullable + backfill
# verify: SELECT count(*) FROM t WHERE <col> IS NULL;  -> must be 0
pnpm prisma migrate dev --name <col>_required        # step 2: flip NOT NULL
```

## Guardrails

- Feature flag **off first** in a rollback runbook so app code stops touching the new tables.
- Postgres treats `NULL` as distinct in unique indexes — for "one row where col IS NULL" uniqueness use
  an explicit **partial unique index** in the migration SQL.
- Auto-pause / external side effects are NOT reverted by a schema rollback — document the manual step
  (e.g. agents left `blocked` must be reactivated).
- Reference the migration-authoring checklist in the repo (recent commits `22001bbd2`, `329652a2d`).
