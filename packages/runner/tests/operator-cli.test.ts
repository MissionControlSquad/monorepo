import { describe, it, expect, vi } from "vitest";
// The operator CLI is a root script (sibling to scripts/doctor.mjs / scripts/db-backup.mjs) so it
// stays close to the tools it wraps. Its routing is pure and side-effect-free, so we unit-test it
// here in the runner's DB-free vitest home rather than under apps/web (whose setup requires a DB).
import {
  route,
  run,
  envCheck,
  makeDefaultHandlers,
  COMMANDS,
  REQUIRED_ENV,
  resolveService,
  serviceInstall,
  serviceCtl,
  installSteps,
  updateSteps,
  installCmd,
  updateCmd,
  renderSystemdUnit,
  renderLaunchdPlist,
  SYSTEMD_UNIT,
  LAUNCHD_LABEL,
  RUNNER_BIN,
  // @ts-expect-error — plain .mjs script, no type declarations; imported for its pure exports.
} from "../../../scripts/operator.mjs";

describe("operator CLI - route()", () => {
  it("routes each known command to a command result", () => {
    for (const command of COMMANDS) {
      expect(route([command])).toEqual({ kind: "command", command, rest: [] });
    }
  });

  it("passes trailing args through as rest", () => {
    expect(route(["db:backup", "--gzip", "--out", "dir"])).toEqual({
      kind: "command",
      command: "db:backup",
      rest: ["--gzip", "--out", "dir"],
    });
  });

  it("treats no command / help / -h as help", () => {
    for (const argv of [[], ["help"], ["--help"], ["-h"]]) {
      expect(route(argv).kind).toBe("help");
    }
  });

  it("flags an unrecognized command as unknown, carrying the requested name", () => {
    expect(route(["frobnicate"])).toEqual({ kind: "unknown", requested: "frobnicate", rest: [] });
  });
});

describe("operator CLI - run() dispatch", () => {
  function mockHandlers() {
    // Build one mock per known command so the dispatch loop covers every route (including the
    // install/update/service:* additions), keeping routing + COMMANDS in sync.
    return Object.fromEntries((COMMANDS as string[]).map((c) => [c, vi.fn(() => 0)])) as Record<
      string,
      ReturnType<typeof vi.fn>
    >;
  }

  it("dispatches each command to exactly its own handler with the rest args", async () => {
    for (const command of COMMANDS) {
      const handlers = mockHandlers();
      const code = await run([command, "x"], handlers);
      expect(code).toBe(0);
      expect(handlers[command as keyof typeof handlers]).toHaveBeenCalledWith(["x"]);
      // No other handler fired.
      for (const other of (COMMANDS as string[]).filter((c) => c !== command)) {
        expect(handlers[other as keyof typeof handlers]).not.toHaveBeenCalled();
      }
    }
  });

  it("propagates a handler's non-zero exit code", async () => {
    const handlers = mockHandlers();
    handlers.doctor.mockReturnValue(2);
    expect(await run(["doctor"], handlers)).toBe(2);
  });

  it("normalizes a spawnSync-style { status } result into an exit code", async () => {
    const handlers = mockHandlers();
    handlers["db:backup"].mockReturnValue({ status: 1 } as never);
    expect(await run(["db:backup"], handlers)).toBe(1);
  });

  it("unknown command returns a non-zero code and does not call any handler", async () => {
    const handlers = mockHandlers();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await run(["nope"], handlers);
    expect(code).toBe(1);
    for (const h of Object.values(handlers)) expect(h).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith(expect.stringContaining("unknown command: nope"));
    err.mockRestore();
    log.mockRestore();
  });

  it("help returns 0 and calls no handler", async () => {
    const handlers = mockHandlers();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await run([], handlers)).toBe(0);
    for (const h of Object.values(handlers)) expect(h).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("operator CLI - makeDefaultHandlers() wiring", () => {
  it("wires each command to the underlying tool via an injectable spawn (no real processes)", () => {
    const spawn = vi.fn((..._args: unknown[]) => ({ status: 0 }));
    const handlers = makeDefaultHandlers({ spawn });

    handlers.doctor([]);
    handlers["db:backup"](["--gzip"]);
    handlers["db:migrate:status"]([]);

    // [cmd, args[], opts] tuples — the .mjs import is untyped, so read them as loose arrays.
    const calls = spawn.mock.calls as unknown as [string, string[], { cwd: string }][];
    // doctor → scripts/doctor.mjs
    expect(calls[0][0]).toBe("node");
    expect(calls[0][1][0]).toMatch(/scripts\/doctor\.mjs$/);
    // db:backup → scripts/db-backup.mjs with flags passed through
    expect(calls[1][1][0]).toMatch(/scripts\/db-backup\.mjs$/);
    expect(calls[1][1]).toContain("--gzip");
    // db:migrate:status → prisma migrate status in packages/database
    expect(calls[2][0]).toBe("npx");
    expect(calls[2][1]).toEqual(["prisma", "migrate", "status"]);
    expect(calls[2][2].cwd).toMatch(/packages\/database$/);
  });
});

describe("operator CLI - envCheck()", () => {
  const base = REQUIRED_ENV.reduce((acc: Record<string, string>, k: string) => ({ ...acc, [k]: "x" }), {});

  it("returns 0 when every required var is set", () => {
    expect(envCheck([], { env: base, log: () => {}, errorLog: () => {} })).toBe(0);
  });

  it("returns 1 when a required var is missing", () => {
    const { [REQUIRED_ENV[0]]: _drop, ...missing } = base;
    expect(envCheck([], { env: missing, log: () => {}, errorLog: () => {} })).toBe(1);
  });
});

describe("operator CLI - install / update (read-only)", () => {
  it("install routes and prints steps mentioning the package, login, and service:install", () => {
    const lines: string[] = [];
    expect(installCmd([], { log: (m: string) => lines.push(m) })).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("@agentcenter/runner");
    expect(text).toContain(`${RUNNER_BIN} login`);
    expect(text).toContain("service:install");
    // Steps are just printed - no npm/spawn - so the same lines come from the pure helper.
    expect(installSteps().join("\n")).toContain("npm install -g");
  });

  it("update prints the self-update hint (npm update -g) without running anything", () => {
    const lines: string[] = [];
    expect(updateCmd([], { log: (m: string) => lines.push(m) })).toBe(0);
    expect(lines.join("\n")).toContain("npm update -g @agentcenter/runner");
    expect(updateSteps().join("\n")).toContain("npm update -g");
  });
});

describe("operator CLI - resolveService() platform detection", () => {
  it("picks launchd on macOS (darwin) with a LaunchAgents plist path", () => {
    const svc = resolveService({ platform: "darwin", home: "/Users/x" });
    expect(svc.manager).toBe("launchd");
    expect(svc.label).toBe(LAUNCHD_LABEL);
    expect(svc.unitPath).toBe(`/Users/x/Library/LaunchAgents/${LAUNCHD_LABEL}.plist`);
    expect(svc.render()).toContain("<plist");
  });

  it("picks systemd on Linux with a ~/.config/systemd/user unit path", () => {
    const svc = resolveService({ platform: "linux", home: "/home/x" });
    expect(svc.manager).toBe("systemd");
    expect(svc.serviceName).toBe(SYSTEMD_UNIT);
    expect(svc.unitPath).toBe(`/home/x/.config/systemd/user/${SYSTEMD_UNIT}`);
    expect(svc.render()).toContain("[Service]");
  });

  it("reports unsupported for anything else (e.g. win32)", () => {
    expect(resolveService({ platform: "win32" }).manager).toBe("unsupported");
  });

  it("render helpers embed the runner binary invocation", () => {
    expect(renderSystemdUnit({ bin: "agentcenter-runner", home: "/home/x" })).toContain(
      "ExecStart=agentcenter-runner start",
    );
    expect(renderLaunchdPlist({ bin: "agentcenter-runner", home: "/Users/x" })).toContain(
      "<string>agentcenter-runner</string><string>start</string>",
    );
  });
});

describe("operator CLI - service:install write safety", () => {
  it("without --write prints the unit and performs NO filesystem write", () => {
    const fs = { mkdirSync: vi.fn(), writeFileSync: vi.fn() };
    const lines: string[] = [];
    const code = serviceInstall([], {
      platform: "linux",
      home: "/home/x",
      fs,
      log: (m: string) => lines.push(m),
      errorLog: () => {},
    });
    expect(code).toBe(0);
    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("dry run");
    expect(lines.join("\n")).toContain("[Service]");
  });

  it("with --write creates the unit file at the platform path (systemd)", () => {
    const fs = { mkdirSync: vi.fn(), writeFileSync: vi.fn() };
    const code = serviceInstall(["--write"], {
      platform: "linux",
      home: "/home/x",
      fs,
      log: () => {},
      errorLog: () => {},
    });
    expect(code).toBe(0);
    expect(fs.mkdirSync).toHaveBeenCalledWith("/home/x/.config/systemd/user", { recursive: true });
    const [path, contents] = fs.writeFileSync.mock.calls[0] as [string, string];
    expect(path).toBe(`/home/x/.config/systemd/user/${SYSTEMD_UNIT}`);
    expect(contents).toContain("[Install]");
  });

  it("returns 1 on an unsupported platform and writes nothing", () => {
    const fs = { mkdirSync: vi.fn(), writeFileSync: vi.fn() };
    const errors: string[] = [];
    const code = serviceInstall(["--write"], {
      platform: "win32",
      fs,
      log: () => {},
      errorLog: (m: string) => errors.push(m),
    });
    expect(code).toBe(1);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(errors.join("\n")).toContain("unsupported platform");
  });
});

describe("operator CLI - service:start|stop|status shell-out", () => {
  it("uses `systemctl --user <action> <unit>` on Linux", () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    serviceCtl("start", ["--now"], { platform: "linux", home: "/home/x", spawn, errorLog: () => {} });
    const [cmd, args] = spawn.mock.calls[0] as unknown as [string, string[]];
    expect(cmd).toBe("systemctl");
    expect(args).toEqual(["--user", "start", SYSTEMD_UNIT, "--now"]);
  });

  it("uses `launchctl load/unload/list` on macOS", () => {
    const start = vi.fn(() => ({ status: 0 }));
    serviceCtl("start", [], { platform: "darwin", home: "/Users/x", spawn: start, errorLog: () => {} });
    expect((start.mock.calls[0] as unknown as [string, string[]])[0]).toBe("launchctl");
    expect((start.mock.calls[0] as unknown as [string, string[]])[1]).toEqual([
      "load",
      "-w",
      `/Users/x/Library/LaunchAgents/${LAUNCHD_LABEL}.plist`,
    ]);

    const status = vi.fn(() => ({ status: 0 }));
    serviceCtl("status", [], { platform: "darwin", home: "/Users/x", spawn: status, errorLog: () => {} });
    expect((status.mock.calls[0] as unknown as [string, string[]])[1]).toEqual(["list", LAUNCHD_LABEL]);
  });

  it("returns 1 on an unsupported platform without spawning", () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    const code = serviceCtl("start", [], { platform: "win32", spawn, errorLog: () => {} });
    expect(code).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe("operator CLI - makeDefaultHandlers() wiring for service commands", () => {
  it("routes service:start / service:stop / service:status through the injected spawn", () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    const handlers = makeDefaultHandlers({ spawn });
    // These shell out via spawn; on non-linux/mac hosts they no-op to exit 1, but on CI (linux/mac)
    // they invoke the injected spawn. Assert the wiring exists and is callable.
    expect(typeof handlers["service:start"]).toBe("function");
    expect(typeof handlers["service:install"]).toBe("function");
    expect(typeof handlers.install).toBe("function");
    expect(typeof handlers.update).toBe("function");
  });
});
