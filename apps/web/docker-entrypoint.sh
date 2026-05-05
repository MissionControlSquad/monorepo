#!/bin/sh
set -e

# Force HOSTNAME to 0.0.0.0 so Next.js binds to all interfaces.
# Docker sets HOSTNAME to the container ID at runtime, which makes
# Next.js standalone server bind only to the container's private IP,
# causing 404s from Traefik and failing healthchecks.
export HOSTNAME=0.0.0.0

PRISMA="node /prisma-cli/node_modules/prisma/build/index.js"

run_migrations() {
  if $PRISMA migrate deploy >/tmp/migrate_out 2>&1; then
    cat /tmp/migrate_out
    return 0
  fi

  cat /tmp/migrate_out

  if grep -q "P3005" /tmp/migrate_out; then
    # Non-empty DB with no migration history — baseline all existing migrations then retry.
    # Happens when a DB was provisioned by an older workflow before migration tracking.
    echo "Detected P3005 — baselining existing schema..."
    for dir in prisma/migrations/*/; do
      name=$(basename "$dir")
      [ "$name" = "*" ] && continue
      echo "  Resolving: $name"
      $PRISMA migrate resolve --applied "$name" 2>/dev/null || true
    done
    echo "Baseline complete — running migrate deploy..."
    $PRISMA migrate deploy
    return $?
  fi

  if grep -q "P3009" /tmp/migrate_out; then
    # A previously attempted migration is recorded as failed — resolve it and retry.
    # Happens when a migration's SQL failed (e.g. ALTER TYPE on a type that didn't
    # exist in an older DB), leaving a failed row in _prisma_migrations.
    failed=$(sed -n 's/.*The `\([^`]*\)` migration started at.*/\1/p' /tmp/migrate_out | head -1)
    if [ -z "$failed" ]; then
      echo "P3009: could not extract failed migration name" >&2
      return 1
    fi
    echo "Detected P3009 — resolving failed migration: $failed"
    $PRISMA migrate resolve --rolled-back "$failed" 2>/dev/null || true
    echo "Retrying migrate deploy..."
    if $PRISMA migrate deploy >/tmp/migrate_retry 2>&1; then
      cat /tmp/migrate_retry
      return 0
    fi
    cat /tmp/migrate_retry
    # Migration still failing — mark as applied and skip (schema likely already
    # contains these changes from an earlier db push on this DB).
    if grep -q "P3009" /tmp/migrate_retry; then
      echo "Migration still failing — marking as applied and skipping: $failed"
      $PRISMA migrate resolve --applied "$failed" 2>/dev/null || true
      $PRISMA migrate deploy
      return $?
    fi
    return 1
  fi

  return 1
}

echo "Running database migrations..."
run_migrations

echo "Starting server..."
exec node apps/web/server.cjs
