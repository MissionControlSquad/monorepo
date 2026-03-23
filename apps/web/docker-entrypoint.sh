#!/bin/sh
set -e

# Force HOSTNAME to 0.0.0.0 so Next.js binds to all interfaces.
# Docker sets HOSTNAME to the container ID at runtime, which makes
# Next.js standalone server bind only to the container's private IP,
# causing 404s from Traefik and failing healthchecks.
export HOSTNAME=0.0.0.0

echo "Running database migrations..."
node /prisma-cli/node_modules/prisma/build/index.js migrate deploy

echo "Starting server..."
exec node apps/web/server.cjs
