export default {
  schema: "./prisma/schema",
  // Migrations live next to the schema folder, not inside it. Prisma 6's config-file mode
  // otherwise defaults to <schema>/migrations, which doesn't exist here — so `migrate deploy`
  // finds 0 migrations and the DB silently falls back to `db push` (schema only, no seed SQL).
  migrations: { path: "./prisma/migrations" },
};
