#!/usr/bin/env node
// Operator health check (parity #24 — `doctor`). Verifies the environment is wired up before boot:
// Node version, required env vars, database connectivity + migration status. Read-only; exits
// non-zero if any critical check fails so it can gate a deploy. Run: `npm run doctor`.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let hadCritical = false;
const ok = (m) => console.log(`  ${GREEN}✓${RESET} ${m}`);
const warn = (m) => console.log(`  ${YELLOW}!${RESET} ${m}`);
const fail = (m) => {
  hadCritical = true;
  console.log(`  ${RED}✗${RESET} ${m}`);
};
const section = (m) => console.log(`\n${m}`);

// ── Node ────────────────────────────────────────────────────────────
section("Runtime");
const major = Number(process.versions.node.split(".")[0]);
if (major >= 18) ok(`Node ${process.versions.node}`);
else fail(`Node ${process.versions.node} — requires >= 18`);

// ── Env vars ────────────────────────────────────────────────────────
section("Environment");
const REQUIRED = ["POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING", "CRON_SECRET"];
const OPTIONAL = [
  "SYSTEM_SECRET",
  "NEXT_PUBLIC_SAAS_ORG_ID", // buildbase (dormant until set)
  "NEXT_PUBLIC_SAAS_SERVER_URL",
  "BUILDBASE_MCP_SECRET",
  "RESEND_API_KEY", // support email
];
for (const key of REQUIRED) {
  if (process.env[key] && process.env[key].trim()) ok(`${key} set`);
  else fail(`${key} is required but not set`);
}
for (const key of OPTIONAL) {
  if (process.env[key] && process.env[key].trim()) ok(`${key} set`);
  else warn(`${key} not set ${DIM}(optional)${RESET}`);
}

// ── Database ────────────────────────────────────────────────────────
section("Database");
if (!process.env.POSTGRES_PRISMA_URL) {
  fail("skipping DB checks — POSTGRES_PRISMA_URL not set");
} else {
  // `prisma migrate status` exits 0 only when fully in sync; it exits non-zero for pending
  // migrations AND drift — both mean the DB IS reachable. Only a connection error is critical.
  const classify = (text) => {
    if (/P1001|P1000|P1002|ECONNREFUSED|Can't reach database|authentication failed/i.test(text)) {
      fail("database unreachable — check POSTGRES_PRISMA_URL");
      return;
    }
    ok("database reachable");
    if (/Database schema is up to date/i.test(text)) ok("migrations up to date");
    else if (/have not yet been applied/i.test(text)) {
      warn("pending migrations — run `npm run db:migrate:deploy`");
    } else if (/not in sync|drift|does not match/i.test(text)) {
      warn("schema drift vs migration history (expected if the DB was set up via `db push`)");
    } else {
      ok("migration status checked");
    }
  };
  try {
    classify(
      execFileSync("npx", ["prisma", "migrate", "status"], {
        cwd: resolve(root, "packages/database"),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      }),
    );
  } catch (err) {
    classify(`${err.stdout ?? ""}${err.stderr ?? ""}${err.message ?? ""}`);
  }
}

// ── Summary ─────────────────────────────────────────────────────────
section(hadCritical ? `${RED}✗ doctor: critical checks failed${RESET}` : `${GREEN}✓ doctor: all critical checks passed${RESET}`);
process.exit(hadCritical ? 1 : 0);
