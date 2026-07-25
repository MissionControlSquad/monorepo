#!/usr/bin/env node
// Operator DB backup (parity #24/#39 — `db:backup`). Dumps the Postgres database to a timestamped
// SQL file under ./backups via pg_dump. Reads the direct (non-pooled) connection string. Exits
// non-zero on any failure so it can gate a deploy. Run: `npm run db:backup [-- --gzip] [-- --out DIR]`.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, statSync, readdirSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const fail = (m) => {
  console.error(`${RED}✗ db:backup: ${m}${RESET}`);
  process.exit(1);
};

// ── Args ──
const args = process.argv.slice(2);
const gzip = args.includes("--gzip");
const outIdx = args.indexOf("--out");
const outDir = resolve(outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : "backups");
// Retention: keep the newest N backups in outDir, prune older ones. --keep 0 disables pruning.
const keepIdx = args.indexOf("--keep");
const keep = keepIdx >= 0 && args[keepIdx + 1] ? Math.max(0, parseInt(args[keepIdx + 1], 10) || 0) : 14;

// ── Connection string (prefer the direct, non-pooled URL for pg_dump) ──
const url =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL;
if (!url) fail("no database URL — set POSTGRES_URL_NON_POOLING (or POSTGRES_PRISMA_URL / DATABASE_URL)");

// ── pg_dump present? ──
if (spawnSync("pg_dump", ["--version"], { stdio: "ignore" }).status !== 0) {
  fail("pg_dump not found on PATH — install PostgreSQL client tools");
}

// ── Timestamped target (stable, sortable) ──
const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
const base = `agentcenter-${stamp}.sql${gzip ? ".gz" : ""}`;
mkdirSync(outDir, { recursive: true });
const target = resolve(outDir, base);

console.log(`${DIM}Dumping database → ${target}${RESET}`);
try {
  const pgArgs = ["--no-owner", "--no-privileges", url];
  if (gzip) {
    // pg_dump → gzip → file
    const dump = spawnSync("bash", ["-c", `pg_dump --no-owner --no-privileges ${JSON.stringify(url)} | gzip > ${JSON.stringify(target)}`], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    if (dump.status !== 0) throw new Error(dump.stderr?.toString().split("\n").find((l) => l.trim()) ?? "pg_dump failed");
  } else {
    execFileSync("pg_dump", ["-f", target, ...pgArgs], { stdio: ["ignore", "ignore", "pipe"] });
  }
} catch (err) {
  const text = `${err.stderr ?? ""}${err.message ?? ""}`;
  fail(text.split("\n").find((l) => l.trim())?.trim() ?? "pg_dump failed");
}

const bytes = statSync(target).size;
const kb = (bytes / 1024).toFixed(1);
console.log(`${GREEN}✓ db:backup: wrote ${kb} KB → ${target}${RESET}`);

// ── Retention: prune old backups beyond --keep ──
if (keep > 0) {
  try {
    const backups = readdirSync(outDir)
      .filter((f) => /^agentcenter-.*\.sql(\.gz)?$/.test(f))
      .map((f) => ({ f, t: statSync(resolve(outDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t); // newest first
    const stale = backups.slice(keep);
    for (const { f } of stale) unlinkSync(resolve(outDir, f));
    if (stale.length) console.log(`${DIM}Pruned ${stale.length} old backup(s), keeping newest ${keep}.${RESET}`);
  } catch (err) {
    // Pruning failure must not fail the backup itself (the dump already succeeded).
    console.error(`${DIM}retention prune skipped: ${err.message}${RESET}`);
  }
}
