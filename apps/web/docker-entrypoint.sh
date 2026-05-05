#!/bin/sh
set -e

# Force HOSTNAME to 0.0.0.0 so Next.js binds to all interfaces.
# Docker sets HOSTNAME to the container ID at runtime, which makes
# Next.js standalone server bind only to the container's private IP,
# causing 404s from Traefik and failing healthchecks.
export HOSTNAME=0.0.0.0

PRISMA="node /prisma-cli/node_modules/prisma/build/index.js"

resolve_schema_error() {
  # Handles P3009 (pre-existing failed migration) and P3018 (just failed).
  # Strategy: db push first to bring schema to the correct state, then mark
  # every stuck migration as applied (db push already applied those changes),
  # then run migrate deploy which should be a clean no-op or apply new ones.
  echo "Detected migration error — syncing schema via db push..."
  $PRISMA db push --skip-generate --accept-data-loss 2>/dev/null || true

  echo "Marking all stuck migrations as applied..."
  # _prisma_migrations rows that started but never finished (P3009/P3018 state)
  # Extract name from either P3009 format: The `<name>` migration started at
  # or P3018 format: Migration name: <name>
  local outfile="$1"
  local failed
  failed=$(sed -n \
    -e 's/.*The `\([^`]*\)` migration started at.*/\1/p' \
    -e 's/.*Migration name: \([^ ]*\).*/\1/p' \
    "$outfile" | head -1)
  if [ -n "$failed" ]; then
    echo "  Resolving as applied: $failed"
    $PRISMA migrate resolve --applied "$failed" 2>/dev/null || true
  fi

  if $PRISMA migrate deploy >/tmp/migrate_recover 2>&1; then
    cat /tmp/migrate_recover
    return 0
  fi
  cat /tmp/migrate_recover
  # If another migration is stuck, resolve it and try once more
  if grep -qE "P3009|P3018" /tmp/migrate_recover; then
    local failed2
    failed2=$(sed -n \
      -e 's/.*The `\([^`]*\)` migration started at.*/\1/p' \
      -e 's/.*Migration name: \([^ ]*\).*/\1/p' \
      /tmp/migrate_recover | head -1)
    [ -n "$failed2" ] && $PRISMA migrate resolve --applied "$failed2" 2>/dev/null || true
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
    if $PRISMA migrate deploy >/tmp/migrate_post_baseline 2>&1; then
      cat /tmp/migrate_post_baseline
    else
      cat /tmp/migrate_post_baseline
      if grep -qE "P3009|P3018" /tmp/migrate_post_baseline; then
        resolve_schema_error /tmp/migrate_post_baseline || return 1
      else
        return 1
      fi
    fi
    # db push fills schema gaps left by the baseline — tables added after the client
    # was provisioned (feature_flags, licenses, etc.) are missing even though all
    # migrations are marked applied. db push adds only what is missing, never drops.
    echo "Syncing any missing schema elements (db push)..."
    $PRISMA db push --skip-generate --accept-data-loss 2>/dev/null || true
    return 0
  fi

  if grep -qE "P3009|P3018" /tmp/migrate_out; then
    resolve_schema_error /tmp/migrate_out
    return $?
  fi

  return 1
}

echo "Running database migrations..."
run_migrations

echo "Starting server..."
exec node apps/web/server.cjs
