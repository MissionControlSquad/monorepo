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
  // @ts-expect-error — plain .mjs script, no type declarations; imported for its pure exports.
} from "../../../scripts/operator.mjs";

describe("operator CLI — route()", () => {
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

describe("operator CLI — run() dispatch", () => {
  function mockHandlers() {
    return {
      doctor: vi.fn(() => 0),
      "env:check": vi.fn(() => 0),
      "db:backup": vi.fn(() => 0),
      "db:migrate:status": vi.fn(() => 0),
    };
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

describe("operator CLI — makeDefaultHandlers() wiring", () => {
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

describe("operator CLI — envCheck()", () => {
  const base = REQUIRED_ENV.reduce((acc: Record<string, string>, k: string) => ({ ...acc, [k]: "x" }), {});

  it("returns 0 when every required var is set", () => {
    expect(envCheck([], { env: base, log: () => {}, errorLog: () => {} })).toBe(0);
  });

  it("returns 1 when a required var is missing", () => {
    const { [REQUIRED_ENV[0]]: _drop, ...missing } = base;
    expect(envCheck([], { env: missing, log: () => {}, errorLog: () => {} })).toBe(1);
  });
});
