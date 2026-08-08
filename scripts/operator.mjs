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
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

/** The operator commands, in help order. Kept as data so routing + tests stay in sync. */
export const COMMANDS = [
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
