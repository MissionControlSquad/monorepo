#!/usr/bin/env bash
# Baseline existing DB: mark all migrations as applied, then deploy any new ones.
# Use when you get P3005 "The database schema is not empty" — i.e. the DB already
# has the schema but _prisma_migrations history is missing.
#
# If your DB is a dev copy and you can wipe it, use instead:
#   npx prisma migrate reset
set -e
cd "$(dirname "$0")/../../../"

echo "Baselining all existing migrations..."
for dir in packages/database/prisma/migrations/*/; do
  name=$(basename "$dir")
  [ "$name" = "*" ] && continue
  echo "  Resolving: $name"
  node /prisma-cli/node_modules/prisma/build/index.js migrate resolve --applied "$name" 2>/dev/null || true
done

echo "Baseline done — running deploy to apply any pending migrations..."
node /prisma-cli/node_modules/prisma/build/index.js migrate deploy
