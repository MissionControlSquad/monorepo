#!/usr/bin/env bash
# Baseline existing DB: mark migrations as already applied, then deploy the rest.
# Use when you get P3005 "The database schema is not empty" and your DB already
# has the schema (e.g. from an older workflow or manual setup).
#
# If your DB is a dev copy and you can wipe it, use instead:
#   npx prisma migrate reset
#
# Prisma has no "build" command; use: npx prisma generate
set -e
cd "$(dirname "$0")/.."

# Mark every migration as applied EXCEPT the last one (admin_user_link_user).
# If your DB doesn't have some of these, comment out the ones you haven't applied yet.
for name in \
  20260210081651_init \
  20260210082713_add_project_id_everywhere \
  20260211224937_soft_delete_tasks \
  20260212000000_add_auth_and_missing_tables \
  20260212120000_remove_agent_session_key \
  20260215000000_add_agent_config_version \
  20260215200000_add_channels_and_channel_messages \
  20260216000000_add_profiles_and_user \
  20260216100000_channel_creator_profile_only \
  20260216110000_channel_profile_only_no_legacy; do
  echo "Resolving as applied: $name"
  npx prisma migrate resolve --applied "$name"
done

echo "Baseline done. Running deploy to apply remaining migrations..."
npx prisma migrate deploy
