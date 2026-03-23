#!/bin/sh
set -e

# Force HOSTNAME to 0.0.0.0 so Next.js binds to all interfaces.
# Docker sets HOSTNAME to the container ID at runtime, which makes
# Next.js standalone server bind only to the container's private IP,
# causing 404s from Traefik and failing healthchecks.
export HOSTNAME=0.0.0.0

echo "=== Debug: prisma directory ==="
ls -la ./prisma/ || echo "prisma dir missing"
echo "=== Debug: migrations directory ==="
ls -la ./prisma/migrations/ || echo "migrations dir missing"
echo "=== Debug: prisma.config.ts ==="
cat ./prisma.config.ts || echo "config missing"
echo "=== Debug: CWD ==="
pwd
echo "================================"

echo "Running database migrations..."
node /prisma-cli/node_modules/prisma/build/index.js migrate deploy

echo "Starting server..."
exec node apps/web/server.js
