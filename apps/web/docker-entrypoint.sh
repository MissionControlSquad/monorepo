#!/bin/sh
set -e

# Force HOSTNAME to 0.0.0.0 so Next.js binds to all interfaces.
# Docker sets HOSTNAME to the container ID at runtime, which makes
# Next.js standalone server bind only to the container's private IP,
# causing 404s from Traefik and failing healthchecks.
export HOSTNAME=0.0.0.0

PRISMA="node /prisma-cli/node_modules/prisma/build/index.js"

# Resolve a P3009 (failed migration) by rolling it back and retrying deploy.
# If the migration keeps failing (e.g. ALTER TYPE on a missing type in an old DB
# that was provisioned before that feature existed), mark it as applied and skip —
# the schema was already pushed directly so those changes are already present.
resolve_p3009() {
  local outfile="$1"
  local failed
  failed=$(sed -n 's/.*The `\([^`]*\)` migration started at.*/\1/p' "$outfile" | head -1)
  if [ -z "$failed" ]; then
    echo "P3009: could not extract failed migration name" >&2
    return 1
  fi
  echo "Detected P3009 — resolving failed migration: $failed"
  $PRISMA migrate resolve --rolled-back "$failed" 2>/dev/null || true
  if $PRISMA migrate deploy >/tmp/migrate_p3009 2>&1; then
    cat /tmp/migrate_p3009
    return 0
  fi
  cat /tmp/migrate_p3009
  if grep -q "P3009" /tmp/migrate_p3009; then
    echo "Migration still failing — marking as applied and skipping: $failed"
    $PRISMA migrate resolve --applied "$failed" 2>/dev/null || true
    $PRISMA migrate deploy
    return $?
  fi
  return 1
}

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
    # Capture output so we can detect P3009 if baseline left a partially-applied migration
    if $PRISMA migrate deploy >/tmp/migrate_post_baseline 2>&1; then
      cat /tmp/migrate_post_baseline
      return 0
    fi
    cat /tmp/migrate_post_baseline
    if grep -q "P3009" /tmp/migrate_post_baseline; then
      resolve_p3009 /tmp/migrate_post_baseline
      return $?
    fi
    return 1
  fi

  if grep -q "P3009" /tmp/migrate_out; then
    resolve_p3009 /tmp/migrate_out
    return $?
  fi

  return 1
}

echo "Running database migrations..."
run_migrations

echo "Starting server..."
exec node apps/web/server.cjs
