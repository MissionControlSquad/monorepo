#!/bin/sh
set -e

# Force HOSTNAME to 0.0.0.0 so Next.js binds to all interfaces.
# Docker sets HOSTNAME to the container ID at runtime, which makes
# Next.js standalone server bind only to the container's private IP,
# causing 404s from Traefik and failing healthchecks.
export HOSTNAME=0.0.0.0

echo "Running database migrations..."

# Try migrate deploy; on P3005 (non-empty DB with no migration history),
# baseline all existing migrations then retry. This happens when a DB was
# provisioned by an older workflow before migration tracking was introduced.
# Migrations are at /app/prisma/migrations/ (copied from packages/database/prisma).
if ! node /prisma-cli/node_modules/prisma/build/index.js migrate deploy >/tmp/migrate_err 2>&1; then
  cat /tmp/migrate_err
  if grep -q "P3005" /tmp/migrate_err; then
    echo "Detected P3005 — baselining existing schema..."
    for dir in prisma/migrations/*/; do
      name=$(basename "$dir")
      [ "$name" = "*" ] && continue
      echo "  Resolving: $name"
      node /prisma-cli/node_modules/prisma/build/index.js migrate resolve --applied "$name" 2>/dev/null || true
    done
    echo "Baseline complete — running migrate deploy..."
    node /prisma-cli/node_modules/prisma/build/index.js migrate deploy
  else
    exit 1
  fi
fi

echo "Starting server..."
exec node apps/web/server.cjs
