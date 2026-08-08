#!/usr/bin/env node
// Operator CLI (parity #24 — doctor / env / db management). A thin dispatcher over the existing
// root operator scripts and prisma. It does NOT reimplement backup or migration logic — each
// command shells out to the tool that already owns it:
//   doctor              → scripts/doctor.mjs        (env + DB + migration health, exits non-zero on failure)
//   env:check           → in-process required-env checklist (mirrors apps/web/src/server/env.ts)
//   db:backup           → scripts/db-backup.mjs     (pg_dump → ./backups; passes flags through)
//   db:migrate:status   → prisma migrate status     (in packages/database)
// Read-only except db:backup. Exit code is propagated from the underlying tool so it can gate a deploy.
// Run: `npm run operator <command> [-- <args>]`.
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

/** The operator commands, in help order. Kept as data so routing + tests stay in sync. */
export const COMMANDS = ["doctor", "env:check", "db:backup", "db:migrate:status"];

/** Required env vars (must be set) — mirrors the strict fields of apps/web/src/server/env.ts. */
export const REQUIRED_ENV = [
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "AUTH_SECRET",
  "CRON_SECRET",
];

/** Optional env vars (feature-gated) — surfaced as informational, never fail the check. */
export const OPTIONAL_ENV = [
  "SECRET_ENCRYPTION_KEY",
  "REDIS_URL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "RESEND_API_KEY",
];

/**
 * Pure command router. Given argv, decides which handler to invoke without running anything.
 * Returns a discriminated result: a known command, `help`, or `unknown` (with the requested name).
 */
export function route(argv) {
  const [command, ...rest] = argv;
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    return { kind: "help", rest };
  }
  if (!COMMANDS.includes(command)) {
    return { kind: "unknown", requested: command, rest };
  }
  return { kind: "command", command, rest };
}

/** In-process required-env checklist. Returns 0 when every REQUIRED_ENV var is set, else 1. */
export function envCheck(_rest = [], { env = process.env, log = console.log, errorLog = console.error } = {}) {
  let missing = 0;
  log("Required environment");
  for (const key of REQUIRED_ENV) {
    if (env[key] && String(env[key]).trim()) log(`  ${GREEN}✓${RESET} ${key} set`);
    else {
      missing++;
      errorLog(`  ${RED}✗${RESET} ${key} is required but not set`);
    }
  }
  log("Optional environment");
  for (const key of OPTIONAL_ENV) {
    if (env[key] && String(env[key]).trim()) log(`  ${GREEN}✓${RESET} ${key} set`);
    else log(`  ${YELLOW}!${RESET} ${key} not set ${DIM}(optional)${RESET}`);
  }
  log(missing ? `${RED}✗ env:check: ${missing} required var(s) missing${RESET}` : `${GREEN}✓ env:check: all required vars set${RESET}`);
  return missing ? 1 : 0;
}

/**
 * Build the default handler map. Each handler is intentionally thin: it delegates to the tool that
 * already owns the logic and returns an exit code. `spawn` is injectable so tests can assert routing
 * without touching the filesystem, DB, or child processes.
 */
export function makeDefaultHandlers({ spawn } = {}) {
  const doSpawn = spawn ?? spawnSync;
  const runNode = (scriptRel, rest, opts = {}) =>
    doSpawn("node", [resolve(root, scriptRel), ...rest], {
      stdio: "inherit",
      env: process.env,
      cwd: root,
      ...opts,
    });
  return {
    doctor: (rest) => runNode("scripts/doctor.mjs", rest),
    "db:backup": (rest) => runNode("scripts/db-backup.mjs", rest),
    "db:migrate:status": (rest) =>
      doSpawn("npx", ["prisma", "migrate", "status", ...rest], {
        stdio: "inherit",
        env: process.env,
        cwd: resolve(root, "packages/database"),
      }),
    "env:check": (rest) => envCheck(rest),
  };
}

export function usage(log = console.log) {
  log(
    [
      "agentcenter operator — doctor / env / db management",
      "",
      "Usage:",
      "  npm run operator <command> [-- <args>]",
      "",
      "Commands:",
      "  doctor                environment + DB connectivity + migration status (read-only)",
      "  env:check             validate required env vars are set",
      "  db:backup [-- --gzip] [-- --out DIR] [-- --keep N]   pg_dump the database to ./backups",
      "  db:migrate:status     show applied / pending Prisma migrations",
      "",
      "Exit code is propagated from the underlying tool so it can gate a deploy.",
    ].join("\n"),
  );
}

/** Normalize a handler return (a spawnSync result or a plain number) into an exit code. */
function toExitCode(result) {
  if (typeof result === "number") return result;
  if (result && typeof result.status === "number") return result.status;
  // A spawn that could not start (e.g. binary missing) has status === null but carries an error.
  if (result && result.error) return 1;
  return 0;
}

/**
 * Dispatch argv to a handler and return the resulting exit code. Handlers are injectable so tests
 * can mock the side-effectful ones; production callers use the defaults.
 */
export async function run(argv, handlers = makeDefaultHandlers()) {
  const routed = route(argv);
  if (routed.kind === "help") {
    usage();
    return 0;
  }
  if (routed.kind === "unknown") {
    console.error(`${RED}unknown command: ${routed.requested}${RESET}`);
    usage(console.error);
    return 1;
  }
  const handler = handlers[routed.command];
  if (typeof handler !== "function") {
    console.error(`${RED}no handler registered for: ${routed.command}${RESET}`);
    return 1;
  }
  return toExitCode(await handler(routed.rest));
}

// Run only when invoked directly as a binary (not when imported by tests). pathToFileURL handles
// paths with spaces / special chars that a raw `file://` compare would mismatch on.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`${RED}${err instanceof Error ? err.message : String(err)}${RESET}`);
      process.exit(1);
    });
}
