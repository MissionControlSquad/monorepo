#!/usr/bin/env node
// Operator CLI (parity #24 - doctor / env / db management). A thin dispatcher over the existing
// root operator scripts and prisma. It does NOT reimplement backup or migration logic - each
// command shells out to the tool that already owns it:
//   doctor              → scripts/doctor.mjs        (env + DB + migration health, exits non-zero on failure)
//   env:check           → in-process required-env checklist (mirrors apps/web/src/server/env.ts)
//   db:backup           → scripts/db-backup.mjs     (pg_dump → ./backups; passes flags through)
//   db:migrate:status   → prisma migrate status     (in packages/database)
//   install             → print the managed-install steps for @agentcenter/runner (+ first-run login hint)
//   update              → print the self-update hint (npm update -g / re-run install)
//   service:install     → render (default) or --write a launchd/systemd unit for the runner daemon
//   service:start|stop|restart|status|health|logs → shell to launchctl (macOS) / systemctl --user (Linux)
//   service:uninstall   → stop the service + remove the unit file (only with --force)
// Read-only except db:backup, `service:install --write` (writes one unit file to a user path), and
// `service:uninstall --force` (removes that unit file).
// Nothing destructive or privileged runs without an explicit flag. Exit code is propagated so it can
// gate a deploy. Run: `npm run operator <command> [-- <args>]`.
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import { homedir as osHomedir } from "node:os";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import {
  SECTIONS,
  DEFAULT_WEB_COMMAND,
  REQUIRED_ENV_FOR_BOOT,
  defaultConfig,
  defaultConfigPath,
  loadConfig,
  saveConfig,
  maskConfig,
  setSectionValues,
  fieldSpec,
  SCHEMA,
} from "./operator-config.mjs";
import {
  GENERATED_SECRETS,
  PROVIDED_KEYS,
  planOnboardEnv,
  mergeEnvFile,
  envMap,
} from "./operator-env.mjs";
// Re-export the pure token model so tests (and importers) reach it from the one CLI entrypoint.
export { generateToken, hashToken, verifyToken, redactToken, TOKEN_PREFIX } from "./operator-token.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

/** The operator commands, in help order. Kept as data so routing + tests stay in sync. */
export const COMMANDS = [
  "onboard",
  "configure",
  "bind-workspace",
  "run",
  "token",
  "doctor",
  "env:check",
  "db:backup",
  "db:migrate:status",
  "install",
  "update",
  "service:install",
  "service:start",
  "service:stop",
  "service:restart",
  "service:status",
  "service:health",
  "service:logs",
  "service:uninstall",
];

/** The npm package + published binary name for the standalone runner daemon (packages/runner). */
export const RUNNER_PACKAGE = "@agentcenter/runner";
export const RUNNER_BIN = "agentcenter-runner";

/** Required env vars (must be set) - mirrors the strict fields of apps/web/src/server/env.ts. */
export const REQUIRED_ENV = [
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "AUTH_SECRET",
  "CRON_SECRET",
];

/** Optional env vars (feature-gated) - surfaced as informational, never fail the check. */
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

// ── bind-workspace ──────────────────────────────────────────────────────────────────────────────
const bindWorkspaceUsage = [
  "operator bind-workspace <workspace-id> - bind this self-host instance to ONE buildbase workspace",
  "",
  "Writes TENANT_WORKSPACE_ID to the .env so ONLY members of that workspace can sign in (team RBAC:",
  "viewer/member/admin/owner). Leave it unset for the simple single-default-workspace mode where any",
  "authenticated buildbase user is owner. Multiple workspaces = multiple self-host instances.",
  "Find the workspace id in your buildbase console → Workspace settings (24-hex).",
  "",
  "Usage: npm run operator bind-workspace <workspace-id> [-- --env-file <path>]",
].join("\n");

/**
 * `bind-workspace` handler — writes TENANT_WORKSPACE_ID into the deployment .env (idempotently, via the
 * pure mergeEnvFile helper). A restart applies it. Pure/dep-injected fs for testability.
 */
export function bindWorkspaceCmd(
  rest = [],
  { fs = { readFileSync, writeFileSync, existsSync }, log = console.log, errorLog = console.error } = {},
) {
  if (wantsHelp(rest)) {
    log(bindWorkspaceUsage);
    return 0;
  }
  const { flags } = parseOpts(rest);
  const positional = rest.find((a) => a && !String(a).startsWith("-"));
  const workspaceId = String(flags["workspace-id"] || positional || "").trim();
  if (!/^[a-f0-9]{24}$/i.test(workspaceId)) {
    errorLog(`${RED}✗ bind-workspace: a 24-hex buildbase workspace id is required${RESET}`);
    errorLog(`${DIM}${bindWorkspaceUsage}${RESET}`);
    return 1;
  }
  const envFile = resolve(root, flags["env-file"] || "apps/web/.env");
  const existingText = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  const nextText = mergeEnvFile(existingText, { TENANT_WORKSPACE_ID: workspaceId });
  fs.writeFileSync(envFile, nextText, { mode: 0o600 });
  log(`${GREEN}✓ Bound this instance to buildbase workspace ${workspaceId}${RESET}`);
  log(
    `${DIM}  TENANT_WORKSPACE_ID written to ${envFile}. Only members of this workspace can now sign in.\n  Restart to apply:  docker compose up -d${RESET}`,
  );
  return 0;
}

// ── Managed install / service-lifecycle ─────────────────────────────────────────────────────────
// The runner (packages/runner) is a standalone, outbound-only daemon published as RUNNER_PACKAGE.
// These commands help an operator install it, run it as a login service, and update it. They stay
// thin: `install`/`update` print copy-pasteable steps, and the service commands render a unit file
// or shell to the platform service manager. No privileged/destructive action without an explicit flag.

/** launchd label (macOS) and systemd unit name (Linux) for the runner service. */
export const LAUNCHD_LABEL = "com.agentcenter.runner";
export const SYSTEMD_UNIT = "agentcenter-runner.service";

/** Render a systemd user unit that keeps `agentcenter-runner start` alive on Linux. */
export function renderSystemdUnit({ bin = RUNNER_BIN, home = osHomedir() } = {}) {
  return [
    "[Unit]",
    "Description=AgentCenter Runner (outbound-only agent daemon)",
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `ExecStart=${bin} start`,
    `WorkingDirectory=${home}`,
    "Restart=always",
    "RestartSec=5",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

/** launchd StandardOut/StandardError log file paths - single source of truth for the plist + `service:logs`. */
export function launchdLogPaths(home = osHomedir()) {
  return {
    stdout: join(home, "Library/Logs/agentcenter-runner.log"),
    stderr: join(home, "Library/Logs/agentcenter-runner.err.log"),
  };
}

/** Render a launchd LaunchAgent plist that keeps `agentcenter-runner start` alive on macOS. */
export function renderLaunchdPlist({ bin = RUNNER_BIN, home = osHomedir(), label = LAUNCHD_LABEL } = {}) {
  const logs = launchdLogPaths(home);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key><string>" + label + "</string>",
    "  <key>ProgramArguments</key>",
    "  <array>",
    "    <string>" + bin + "</string><string>start</string>",
    "  </array>",
    "  <key>RunAtLoad</key><true/>",
    "  <key>KeepAlive</key><true/>",
    "  <key>WorkingDirectory</key><string>" + home + "</string>",
    "  <key>StandardOutPath</key><string>" + logs.stdout + "</string>",
    "  <key>StandardErrorPath</key><string>" + logs.stderr + "</string>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

/**
 * Resolve the service manager, unit path, and renderer for the current platform. Pure + injectable
 * so tests can assert launchd-vs-systemd selection without touching the real OS. Returns a
 * `{ manager: "unsupported" }` shape for anything that is neither macOS (darwin) nor Linux.
 */
export function resolveService({ platform = process.platform, home = osHomedir(), bin = RUNNER_BIN } = {}) {
  if (platform === "darwin") {
    return {
      manager: "launchd",
      label: LAUNCHD_LABEL,
      unitPath: join(home, "Library/LaunchAgents", `${LAUNCHD_LABEL}.plist`),
      logPaths: launchdLogPaths(home),
      render: () => renderLaunchdPlist({ bin, home }),
    };
  }
  if (platform === "linux") {
    return {
      manager: "systemd",
      serviceName: SYSTEMD_UNIT,
      unitPath: join(home, ".config/systemd/user", SYSTEMD_UNIT),
      render: () => renderSystemdUnit({ bin, home }),
    };
  }
  return { manager: "unsupported", platform };
}

/** Copy-pasteable managed-install steps for the runner (npm global or npx), plus a first-run login hint. */
export function installSteps({ pkg = RUNNER_PACKAGE, bin = RUNNER_BIN } = {}) {
  return [
    `# Install the AgentCenter runner (${pkg})`,
    `npm install -g ${pkg}      # or run ad-hoc without installing: npx ${pkg} <command>`,
    "",
    "# First run - authenticate the runner against your AgentCenter Cloud:",
    `${bin} login --api-url <url> --api-key <mc_key>`,
    "",
    "# Then start polling (foreground), or install it as a login service (see service:install):",
    `${bin} start`,
    "",
    "# Run this as a managed service instead:",
    "npm run operator service:install   # prints the unit; add -- --write to install it",
    "npm run operator service:start",
  ];
}

/** Self-update hint for a runner installed via npm global (or npx, which always fetches latest). */
export function updateSteps({ pkg = RUNNER_PACKAGE } = {}) {
  return [
    `# Update the AgentCenter runner to the latest published version (${pkg})`,
    `npm update -g ${pkg}       # or reinstall: npm install -g ${pkg}@latest`,
    `# Using npx? It already resolves the latest on each run: npx ${pkg}@latest <command>`,
    "",
    "# After updating a managed service, restart it to pick up the new binary:",
    "npm run operator service:stop && npm run operator service:start",
  ];
}

/** `install` handler - prints managed-install steps. Read-only; never runs npm itself. */
export function installCmd(rest = [], { log = console.log } = {}) {
  for (const line of installSteps()) log(line);
  return 0;
}

/** `update` handler - prints the self-update hint. Read-only; never runs npm itself. */
export function updateCmd(rest = [], { log = console.log } = {}) {
  for (const line of updateSteps()) log(line);
  return 0;
}

/**
 * `service:install` handler. Renders the platform unit and, by default, prints it (dry run). Only
 * with `--write` does it create the unit file at the user-scoped path - the sole filesystem write.
 */
export function serviceInstall(rest = [], {
  platform = process.platform,
  home = osHomedir(),
  fs = { mkdirSync, writeFileSync },
  log = console.log,
  errorLog = console.error,
} = {}) {
  const svc = resolveService({ platform, home });
  if (svc.manager === "unsupported") {
    errorLog(`${RED}service:install: unsupported platform '${svc.platform}' (need macOS or Linux)${RESET}`);
    return 1;
  }
  const unit = svc.render();
  if (!rest.includes("--write")) {
    log(`${DIM}# ${svc.manager} unit for ${svc.unitPath}${RESET}`);
    log(`${DIM}# dry run - re-run with --write to install it, then: npm run operator service:start${RESET}`);
    log(unit);
    return 0;
  }
  fs.mkdirSync(dirname(svc.unitPath), { recursive: true });
  fs.writeFileSync(svc.unitPath, unit, { mode: 0o644 });
  log(`${GREEN}✓ wrote ${svc.manager} unit to ${svc.unitPath}${RESET}`);
  log(`next: npm run operator service:start`);
  return 0;
}

/**
 * `service:start|stop|status` handlers. Thin shell-outs to the platform service manager
 * (launchctl on macOS, `systemctl --user` on Linux). Extra `-- <args>` pass through.
 */
export function serviceCtl(action, rest = [], {
  platform = process.platform,
  home = osHomedir(),
  spawn = spawnSync,
  errorLog = console.error,
} = {}) {
  const svc = resolveService({ platform, home });
  if (svc.manager === "unsupported") {
    errorLog(`${RED}service:${action}: unsupported platform '${svc.platform}' (need macOS or Linux)${RESET}`);
    return 1;
  }
  const opts = { stdio: "inherit", env: process.env };
  if (svc.manager === "systemd") {
    return spawn("systemctl", ["--user", action, svc.serviceName, ...rest], opts);
  }
  // launchd: load/unload the plist to start/stop; `list <label>` to inspect.
  const map = {
    start: ["load", "-w", svc.unitPath],
    stop: ["unload", "-w", svc.unitPath],
    status: ["list", svc.label],
  };
  return spawn("launchctl", [...map[action], ...rest], opts);
}

/**
 * `service:restart` handler. systemd has a native `restart`; launchd has no atomic restart, so we
 * unload then load the plist (stop → start). Thin shell-out; extra `-- <args>` pass through.
 */
export function serviceRestart(rest = [], {
  platform = process.platform,
  home = osHomedir(),
  spawn = spawnSync,
  errorLog = console.error,
} = {}) {
  const svc = resolveService({ platform, home });
  if (svc.manager === "unsupported") {
    errorLog(`${RED}service:restart: unsupported platform '${svc.platform}' (need macOS or Linux)${RESET}`);
    return 1;
  }
  const opts = { stdio: "inherit", env: process.env };
  if (svc.manager === "systemd") {
    return spawn("systemctl", ["--user", "restart", svc.serviceName, ...rest], opts);
  }
  // launchd: no atomic restart - unload then load the plist.
  const stop = spawn("launchctl", ["unload", "-w", svc.unitPath], opts);
  if (stop && typeof stop.status === "number" && stop.status !== 0 && stop.error) return stop;
  return spawn("launchctl", ["load", "-w", svc.unitPath, ...rest], opts);
}

/**
 * `service:health` handler. The runner is outbound-only (no inbound HTTP health endpoint), so health
 * is "is the service active?": systemd `is-active`, launchd `list <label>` (0 when loaded). Returns
 * the probe's exit code so it can gate a check. Read-only.
 */
export function serviceHealth(rest = [], {
  platform = process.platform,
  home = osHomedir(),
  spawn = spawnSync,
  errorLog = console.error,
} = {}) {
  const svc = resolveService({ platform, home });
  if (svc.manager === "unsupported") {
    errorLog(`${RED}service:health: unsupported platform '${svc.platform}' (need macOS or Linux)${RESET}`);
    return 1;
  }
  const opts = { stdio: "inherit", env: process.env };
  if (svc.manager === "systemd") {
    return spawn("systemctl", ["--user", "is-active", svc.serviceName, ...rest], opts);
  }
  return spawn("launchctl", ["list", svc.label, ...rest], opts);
}

/**
 * `service:logs` handler. Tails the service logs: systemd via `journalctl --user -u <unit>`, launchd
 * via `tail` on the plist's StandardOut/StandardError paths. `--follow`/`-f` streams; `--lines N` /
 * `-n N` sets how many trailing lines (default 100). Read-only.
 */
export function serviceLogs(rest = [], {
  platform = process.platform,
  home = osHomedir(),
  spawn = spawnSync,
  errorLog = console.error,
} = {}) {
  const svc = resolveService({ platform, home });
  if (svc.manager === "unsupported") {
    errorLog(`${RED}service:logs: unsupported platform '${svc.platform}' (need macOS or Linux)${RESET}`);
    return 1;
  }
  const follow = rest.includes("--follow") || rest.includes("-f");
  const li = rest.findIndex((a) => a === "--lines" || a === "-n");
  const lines = li >= 0 && rest[li + 1] ? rest[li + 1] : "100";
  const opts = { stdio: "inherit", env: process.env };
  if (svc.manager === "systemd") {
    return spawn(
      "journalctl",
      ["--user", "-u", svc.serviceName, "--lines", String(lines), ...(follow ? ["--follow"] : [])],
      opts,
    );
  }
  // launchd: tail the StandardOut + StandardError files the plist writes to.
  return spawn(
    "tail",
    ["-n", String(lines), ...(follow ? ["-F"] : []), svc.logPaths.stdout, svc.logPaths.stderr],
    opts,
  );
}

/**
 * `service:uninstall` handler. Stops the service, then removes the unit file - but ONLY with an
 * explicit `--force` (or `--yes`) flag. Without it, it refuses and prints what it would do; nothing
 * is stopped or removed. The unit-file removal is the sole destructive action, gated behind the flag.
 */
export function serviceUninstall(rest = [], {
  platform = process.platform,
  home = osHomedir(),
  spawn = spawnSync,
  fs = { rmSync },
  log = console.log,
  errorLog = console.error,
} = {}) {
  const svc = resolveService({ platform, home });
  if (svc.manager === "unsupported") {
    errorLog(`${RED}service:uninstall: unsupported platform '${svc.platform}' (need macOS or Linux)${RESET}`);
    return 1;
  }
  if (!rest.includes("--force") && !rest.includes("--yes")) {
    log(`${YELLOW}service:uninstall would stop the runner and remove ${svc.unitPath}${RESET}`);
    log(`${DIM}# refused - re-run with --force to stop the service and delete the unit file${RESET}`);
    return 0;
  }
  const opts = { stdio: "inherit", env: process.env };
  if (svc.manager === "systemd") {
    spawn("systemctl", ["--user", "stop", svc.serviceName], opts);
    spawn("systemctl", ["--user", "disable", svc.serviceName], opts);
  } else {
    spawn("launchctl", ["unload", "-w", svc.unitPath], opts);
  }
  fs.rmSync(svc.unitPath, { force: true });
  log(`${GREEN}✓ stopped the runner and removed ${svc.manager} unit ${svc.unitPath}${RESET}`);
  return 0;
}

// ── onboard / configure / run / token ─────────────────────────────────────────────────────────
// Guided first-run + config-file + bootstrap-and-serve + operator token minting. These are the parity
// additions. Each has its own `--help`, a fully non-interactive path (flags/env) for CI, and keeps its
// pure decision-making in the testable helpers (operator-config / operator-env / operator-token).

/** True when `--help`/`-h` appears anywhere in a command's args. */
export function wantsHelp(rest = []) {
  return rest.includes("--help") || rest.includes("-h");
}

/** Minimal flag/positional parser. Collects repeated --set/--unset; boolean flags become "true". */
export function parseOpts(rest = []) {
  const flags = {};
  const sets = [];
  const unsets = [];
  const positionals = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--set") {
      if (rest[i + 1] !== undefined) sets.push(rest[++i]);
      continue;
    }
    if (a === "--unset") {
      if (rest[i + 1] !== undefined) unsets.push(rest[++i]);
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
      continue;
    }
    positionals.push(a);
  }
  return { flags, sets, unsets, positionals };
}

/** Split a `key=value` pair. Returns [key, value] (value may contain further `=`). */
function splitKv(pair) {
  const idx = pair.indexOf("=");
  if (idx < 0) return [pair, ""];
  return [pair.slice(0, idx), pair.slice(idx + 1)];
}

const onboardUsage = [
  "operator onboard - guided first-run wizard (idempotent; safe to re-run)",
  "",
  "Checks prerequisites, fills the deployment .env (GENERATES strong AUTH_SECRET / CRON_SECRET /",
  "SECRET_ENCRYPTION_KEY when absent), applies migrations, and prints next steps. Existing non-empty",
  "values are never clobbered unless --force.",
  "",
  "Usage: npm run operator onboard [-- <flags>]",
  "  --non-interactive       never prompt; require everything via flags/env (CI-safe)",
  "  --env-file <path>       .env to write        (default apps/web/.env)",
  "  --pooled-url <url>      POSTGRES_PRISMA_URL",
  "  --direct-url <url>      POSTGRES_URL_NON_POOLING",
  "  --public-url <url>      NEXT_PUBLIC_MC_URL   (optional)",
  "  --force                 regenerate secrets / overwrite existing values",
  "  --skip-doctor           don't run the doctor prerequisite check",
  "  --skip-migrate          don't run db:migrate:deploy",
].join("\n");

/**
 * `onboard` handler. Thin orchestrator around the pure planOnboardEnv/mergeEnvFile helpers: read the
 * current env, plan (generate secrets, keep existing, note missing), write the .env, then run doctor +
 * migrate deploy against the resulting env. Non-interactive path requires the Postgres URLs via flags/env.
 */
export function onboardCmd(rest = [], {
  env = process.env,
  fs = { readFileSync, writeFileSync, mkdirSync, existsSync },
  spawn = spawnSync,
  log = console.log,
  errorLog = console.error,
  gen,
} = {}) {
  if (wantsHelp(rest)) {
    log(onboardUsage);
    return 0;
  }
  const { flags } = parseOpts(rest);
  const force = Boolean(flags.force);
  const nonInteractive = Boolean(flags["non-interactive"]);
  const envFile = resolve(root, flags["env-file"] || "apps/web/.env");

  const existingText = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  const fileMap = envMap(existingText);
  // Detect existing values from the file AND the live env (a value in process.env still "exists").
  const current = { ...env, ...fileMap };
  const provided = {};
  if (flags["pooled-url"]) provided.POSTGRES_PRISMA_URL = flags["pooled-url"];
  if (flags["direct-url"]) provided.POSTGRES_URL_NON_POOLING = flags["direct-url"];
  if (flags["public-url"]) provided.NEXT_PUBLIC_MC_URL = flags["public-url"];

  const plan = planOnboardEnv({ current, provided, force, gen });

  if (plan.missing.length) {
    // No interactive prompt in this environment (or --non-interactive): fail with clear guidance.
    errorLog(`${RED}✗ onboard: missing required value(s): ${plan.missing.join(", ")}${RESET}`);
    errorLog(
      `${DIM}Provide them non-interactively, e.g.:\n  npm run operator onboard -- --pooled-url <POSTGRES_PRISMA_URL> --direct-url <POSTGRES_URL_NON_POOLING>${RESET}`,
    );
    void nonInteractive;
    return 1;
  }

  if (Object.keys(plan.updates).length) {
    const nextText = mergeEnvFile(existingText, plan.updates);
    fs.mkdirSync(dirname(envFile), { recursive: true });
    fs.writeFileSync(envFile, nextText, { mode: 0o600 });
    log(`${GREEN}✓ wrote ${envFile} (mode 600)${RESET}`);
    if (plan.generated.length) log(`  generated strong secrets: ${plan.generated.join(", ")} ${DIM}(values not printed)${RESET}`);
    if (plan.provided.length) log(`  set from flags/env: ${plan.provided.join(", ")}`);
  } else {
    log(`${GREEN}✓ ${envFile} already complete - nothing to write${RESET}`);
  }
  if (plan.kept.length) log(`  ${DIM}kept existing: ${plan.kept.join(", ")}${RESET}`);

  // Effective env for the child steps: the freshly written file overlaid on the live env.
  const effectiveText = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : existingText;
  const childEnv = { ...env, ...envMap(effectiveText) };

  if (!flags["skip-doctor"]) {
    log(`${DIM}# running doctor …${RESET}`);
    const r = spawn("node", [resolve(root, "scripts/doctor.mjs")], { stdio: "inherit", env: childEnv, cwd: root });
    if (toExitCode(r) !== 0) {
      errorLog(`${YELLOW}! doctor reported issues - resolve them before serving traffic${RESET}`);
    }
  }
  if (!flags["skip-migrate"]) {
    log(`${DIM}# applying migrations (db:migrate:deploy) …${RESET}`);
    const r = spawn("npm", ["run", "db:migrate:deploy"], { stdio: "inherit", env: childEnv, cwd: root });
    if (toExitCode(r) !== 0) {
      errorLog(`${RED}✗ onboard: db:migrate:deploy failed - check the database URL and connectivity${RESET}`);
      return 1;
    }
  }

  log("");
  log(`${GREEN}✓ onboard complete.${RESET} Next steps:`);
  log("  1. Review the generated .env (secrets are set; connection strings masked in `configure`).");
  log("  2. Start the app:            npm run operator run");
  log("  3. Mint a runner token:      npm run operator token mint -- --name my-runner --workspace <id>");
  return 0;
}

const configureUsage = [
  "operator configure - read/edit a section of the structured operator config file",
  "",
  "The config file is a versioned operator convenience that renders to env; env.ts stays the runtime",
  "source of truth. Secret values are never printed (connection strings masked; secret fields are",
  "ref-only: env:NAME | vault:PATH | file:PATH).",
  "",
  "Usage: npm run operator configure --section <name> [-- <flags>]",
  `  --section <name>        one of: ${SECTIONS.join(", ")}`,
  "  --set key=value         set a field (repeatable); validates against env.ts-style rules",
  "  --unset key             clear a field (repeatable)",
  "  --path <file>           config file path (default .agentcenter/operator.config.json)",
  "  --json                  print the section as JSON",
  "",
  "With no --set/--unset it prints the section (masked). --set/--unset save the file.",
].join("\n");

/** `configure` handler. Prints or edits one section of the structured config file. Never prints secrets. */
export function configureCmd(rest = [], {
  io,
  log = console.log,
  errorLog = console.error,
  cwd = root,
  env = process.env,
} = {}) {
  if (wantsHelp(rest) || rest.length === 0) {
    log(configureUsage);
    return wantsHelp(rest) ? 0 : rest.length === 0 ? 1 : 0;
  }
  const { flags, sets, unsets } = parseOpts(rest);
  const section = flags.section;
  if (!section) {
    errorLog(`${RED}configure: --section <name> is required (${SECTIONS.join(" | ")})${RESET}`);
    return 1;
  }
  if (!SECTIONS.includes(section)) {
    errorLog(`${RED}configure: unknown section '${section}' (expected: ${SECTIONS.join(", ")})${RESET}`);
    return 1;
  }
  const path = flags.path ? resolve(cwd, flags.path) : defaultConfigPath(cwd, env);
  let config;
  try {
    config = loadConfig(path, io);
  } catch (err) {
    errorLog(`${RED}configure: ${err instanceof Error ? err.message : String(err)}${RESET}`);
    return 1;
  }

  const editing = sets.length > 0 || unsets.length > 0;
  if (editing) {
    const pairs = {};
    for (const s of sets) {
      const [k, v] = splitKv(s);
      pairs[k] = v;
    }
    for (const k of unsets) pairs[k] = "";
    const result = setSectionValues(config, section, pairs);
    if (result.errors.length) {
      errorLog(`${RED}configure: invalid value(s):${RESET}`);
      for (const e of result.errors) errorLog(`  ${RED}✗${RESET} ${e}`);
      return 1;
    }
    try {
      saveConfig(result.config, path, io);
    } catch (err) {
      errorLog(`${RED}configure: ${err instanceof Error ? err.message : String(err)}${RESET}`);
      return 1;
    }
    config = result.config;
    log(`${GREEN}✓ updated [${section}] in ${path}${RESET}  ${DIM}(${result.applied.join(", ")})${RESET}`);
  }

  const masked = maskConfig(config)[section] ?? {};
  if (flags.json) {
    log(JSON.stringify(masked, null, 2));
    return 0;
  }
  log(`[${section}]`);
  const specs = SCHEMA[section];
  for (const key of Object.keys(specs)) {
    const spec = fieldSpec(section, key);
    const val = masked[key];
    const tag = spec.ref ? " (ref-only)" : spec.sensitive ? " (masked)" : "";
    log(`  ${key} = ${val ?? DIM + "(unset)" + RESET}${DIM}${tag}${RESET}`);
  }
  return 0;
}

const runUsage = [
  "operator run - bootstrap (env + migrations) then exec the app server",
  "",
  "A thin, documented wrapper: it verifies required env, applies migrations (db:migrate:deploy), then",
  "execs the same start command package.json / PW_WEB_COMMAND use. Precedence for the command:",
  "  PW_WEB_COMMAND env  >  config deployment.webCommand  >  default (" + DEFAULT_WEB_COMMAND + ")",
  "",
  "Usage: npm run operator run [-- <flags>]",
  "  --dry-run               print the bootstrap + exec plan and exit (run nothing)",
  "  --skip-bootstrap        skip env-check + migrations; just exec the server",
  "  --config <file>         operator config file to read webCommand from",
].join("\n");

/**
 * Resolve the run plan (pure): which server command to exec, whether to bootstrap, and dry-run. Reads
 * the webCommand with the documented precedence. Injectable env + config for tests.
 */
export function resolveRunPlan({ flags = {}, env = {}, config = defaultConfig() } = {}) {
  const command = env.PW_WEB_COMMAND || config?.deployment?.webCommand || DEFAULT_WEB_COMMAND;
  return {
    command,
    bootstrap: !flags["skip-bootstrap"],
    dryRun: Boolean(flags["dry-run"]),
  };
}

/** `run` handler. Bootstrap then exec the server. `--dry-run` prints the plan without side effects. */
export function runCmd(rest = [], {
  env = process.env,
  spawn = spawnSync,
  io,
  log = console.log,
  errorLog = console.error,
  cwd = root,
} = {}) {
  if (wantsHelp(rest)) {
    log(runUsage);
    return 0;
  }
  const { flags } = parseOpts(rest);
  let config = defaultConfig();
  const path = flags.config ? resolve(cwd, flags.config) : defaultConfigPath(cwd, env);
  try {
    config = loadConfig(path, io);
  } catch {
    // A missing/invalid operator config is non-fatal for run - fall back to defaults/env.
  }
  const plan = resolveRunPlan({ flags, env, config });

  if (plan.dryRun) {
    log(`${DIM}# dry run - would perform:${RESET}`);
    if (plan.bootstrap) {
      log("  1. env:check (required vars for boot)");
      log("  2. db:migrate:deploy");
    }
    log(`  ${plan.bootstrap ? "3." : "1."} exec: ${plan.command}`);
    return 0;
  }

  if (plan.bootstrap) {
    const missing = REQUIRED_ENV_FOR_BOOT.filter((k) => !(env[k] && String(env[k]).trim()));
    if (missing.length) {
      errorLog(`${RED}✗ run: missing required env: ${missing.join(", ")}${RESET}`);
      errorLog(`${DIM}Run \`npm run operator onboard\` first to generate/collect them.${RESET}`);
      return 1;
    }
    log(`${DIM}# applying migrations (db:migrate:deploy) …${RESET}`);
    const m = spawn("npm", ["run", "db:migrate:deploy"], { stdio: "inherit", env, cwd: root });
    if (toExitCode(m) !== 0) {
      errorLog(`${RED}✗ run: db:migrate:deploy failed${RESET}`);
      return 1;
    }
  }

  log(`${DIM}# exec: ${plan.command}${RESET}`);
  // Exec via the shell so a full command string (with workspace flags) runs as-is.
  const r = spawn(plan.command, { stdio: "inherit", env, cwd: root, shell: true });
  return toExitCode(r);
}

const tokenUsage = [
  "operator token - mint / list / revoke an operator or runner API token",
  "",
  "Reuses the workspace-scoped ApiKey model (Epic #12) - the same `mc_…` bearer the runner logs in",
  "with. Stored hashed (sha256) + prefix; the plaintext is printed ONCE at mint and never again.",
  "",
  "Usage: npm run operator token <mint|list|revoke> [-- <flags>]",
  "  mint   --name <label> --workspace <id> [--expires <iso8601>]",
  "  list   --workspace <id>",
  "  revoke --id <keyId> --workspace <id>",
  "",
  "Workspace may also come from AGENTCENTER_WORKSPACE_ID. Requires DB access + apps/web .env.",
].join("\n");

/**
 * `token` handler. Shells to apps/web/scripts/operator-token.ts (tsx) which reuses the ApiKey services
 * (needs the DB + `@/` alias + apps/web/.env). The pure token model lives in operator-token.mjs.
 */
export function tokenCmd(rest = [], { spawn = spawnSync, log = console.log, errorLog = console.error } = {}) {
  const [sub, ...subRest] = rest;
  if (wantsHelp(rest) || sub === undefined) {
    log(tokenUsage);
    return sub === undefined && !wantsHelp(rest) ? 1 : 0;
  }
  if (!["mint", "list", "revoke"].includes(sub)) {
    errorLog(`${RED}token: unknown subcommand '${sub}' (expected mint | list | revoke)${RESET}`);
    log(tokenUsage);
    return 1;
  }
  const scriptRel = "scripts/operator-token.ts";
  const r = spawn("npx", ["dotenv", "-e", ".env", "--", "tsx", scriptRel, sub, ...subRest], {
    stdio: "inherit",
    env: process.env,
    cwd: resolve(root, "apps/web"),
  });
  return toExitCode(r);
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
    onboard: (rest) => onboardCmd(rest, { spawn: doSpawn }),
    configure: (rest) => configureCmd(rest),
    "bind-workspace": (rest) => bindWorkspaceCmd(rest),
    run: (rest) => runCmd(rest, { spawn: doSpawn }),
    token: (rest) => tokenCmd(rest, { spawn: doSpawn }),
    doctor: (rest) => runNode("scripts/doctor.mjs", rest),
    "db:backup": (rest) => runNode("scripts/db-backup.mjs", rest),
    "db:migrate:status": (rest) =>
      doSpawn("npx", ["prisma", "migrate", "status", ...rest], {
        stdio: "inherit",
        env: process.env,
        cwd: resolve(root, "packages/database"),
      }),
    "env:check": (rest) => envCheck(rest),
    install: (rest) => installCmd(rest),
    update: (rest) => updateCmd(rest),
    "service:install": (rest) => serviceInstall(rest),
    "service:start": (rest) => serviceCtl("start", rest, { spawn: doSpawn }),
    "service:stop": (rest) => serviceCtl("stop", rest, { spawn: doSpawn }),
    "service:restart": (rest) => serviceRestart(rest, { spawn: doSpawn }),
    "service:status": (rest) => serviceCtl("status", rest, { spawn: doSpawn }),
    "service:health": (rest) => serviceHealth(rest, { spawn: doSpawn }),
    "service:logs": (rest) => serviceLogs(rest, { spawn: doSpawn }),
    "service:uninstall": (rest) => serviceUninstall(rest, { spawn: doSpawn }),
  };
}

export function usage(log = console.log) {
  log(
    [
      "agentcenter operator - doctor / env / db management",
      "",
      "Usage:",
      "  npm run operator <command> [-- <args>]",
      "",
      "Commands:",
      "  onboard               guided first-run: prereqs + generate/collect env + migrate (idempotent)",
      "  configure --section <name>   read/edit a section of the structured operator config file",
      "  bind-workspace <id>   bind this instance to one buildbase workspace (writes TENANT_WORKSPACE_ID)",
      "  run                   bootstrap (env + migrations) then exec the app server (thin wrapper)",
      "  token <mint|list|revoke>     mint/list/revoke an operator or runner API token (reuses ApiKey)",
      "  doctor                environment + DB connectivity + migration status (read-only)",
      "  env:check             validate required env vars are set",
      "  db:backup [-- --gzip] [-- --out DIR] [-- --keep N]   pg_dump the database to ./backups",
      "  db:migrate:status     show applied / pending Prisma migrations",
      "  install               print managed-install steps for the runner (+ first-run login hint)",
      "  update                print the self-update hint for the runner",
      "  service:install [-- --write]   render (or --write) a launchd/systemd unit for the runner",
      "  service:start         start the runner service (launchctl / systemctl --user)",
      "  service:stop          stop the runner service",
      "  service:restart       stop then start the runner service",
      "  service:status        show the runner service status",
      "  service:health        probe whether the runner service is active (systemctl is-active / launchctl list)",
      "  service:logs [-- --lines N] [-- --follow]   tail the service logs (journalctl / tail on the plist logs)",
      "  service:uninstall [-- --force]   stop the service and remove its unit file (refuses without --force)",
      "",
      "install/update/service:install are read-only until you pass an explicit flag (--write).",
      "service:uninstall never removes the unit file without --force.",
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
