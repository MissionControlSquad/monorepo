import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ForkPluginWorkerManager,
  type WorkerEvent,
} from "../../src/server/services/plugin-worker-manager";
import { buildMinimalWorkerEnv } from "@agentcenter/utils";

// Parity #129 — the REAL out-of-process worker: a fork()+NDJSON JSON-RPC round-trip against the in-repo
// example plugin, plus the crash-backoff policy (restart vs give-up). No DB.
//
// HOW TO RUN: npx vitest run tests/integration/plugin-worker-manager.test.ts

const DIR = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE = path.join(DIR, "../fixtures/example-plugin.mjs");
const MIN_ENV = buildMinimalWorkerEnv(process.env, ["NODE_ENV"]);

function waitFor(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (pred()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timed out"));
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe("plugin worker manager — fork + RPC (#129)", () => {
  it("forks the worker, invokes an example tool, gets the result, and shuts down cleanly", async () => {
    const mgr = new ForkPluginWorkerManager();
    const events: WorkerEvent[] = [];
    mgr.onEvent((e) => events.push(e));

    await mgr.start("example", EXAMPLE, MIN_ENV);
    expect(mgr.isRunning("example")).toBe(true);

    // Round-trip: echo.
    const echoed = await mgr.invoke("example", "invoke", {
      kind: "tool",
      name: "echo",
      args: { x: 1 },
    });
    expect(echoed).toEqual({ echoed: { x: 1 } });

    // A tiny bit of real work.
    const added = await mgr.invoke("example", "invoke", {
      kind: "tool",
      name: "add",
      args: { a: 2, b: 3 },
    });
    expect(added).toEqual({ sum: 5 });

    // A throwing tool surfaces as a JSON-RPC error (invoke rejects); the worker stays alive.
    await expect(
      mgr.invoke("example", "invoke", { kind: "tool", name: "boom", args: {} }),
    ).rejects.toThrow(/boom/);
    expect(mgr.isRunning("example")).toBe(true);

    // Graceful shutdown.
    await mgr.stop("example");
    expect(mgr.isRunning("example")).toBe(false);
    expect(events.some((e) => e.type === "stop")).toBe(true);
  });

  it("does NOT leak host secrets into the worker env (minimal env)", () => {
    // The env passed to a worker is built by buildMinimalWorkerEnv and must never carry secret-named keys.
    const env = buildMinimalWorkerEnv(
      { NODE_ENV: "test", DATABASE_URL: "postgres://secret", MY_API_KEY: "x" },
      ["NODE_ENV", "DATABASE_URL", "MY_API_KEY"],
    );
    expect(env.NODE_ENV).toBe("test");
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.MY_API_KEY).toBeUndefined();
  });
});

describe("plugin worker manager — crash policy (#129)", () => {
  it("restarts a crashed worker (backoff) when under the crash cap", async () => {
    const mgr = new ForkPluginWorkerManager({
      crashPolicy: { maxConsecutiveCrashes: 5, baseBackoffMs: 5, maxBackoffMs: 20 },
    });
    const events: WorkerEvent[] = [];
    mgr.onEvent((e) => events.push(e));

    await mgr.start("crashy", EXAMPLE, MIN_ENV);
    // Trigger a hard crash (process.exit(1)); the in-flight invoke rejects.
    await expect(
      mgr.invoke("crashy", "invoke", { kind: "tool", name: "crash", args: {} }),
    ).rejects.toThrow();

    // Policy decided to restart, and the worker comes back up.
    await waitFor(() => events.some((e) => e.type === "restart"));
    await waitFor(() => mgr.isRunning("crashy"));
    const crash = events.find((e) => e.type === "crash");
    expect(crash?.decision?.action).toBe("restart");
    expect(mgr.isDisabled("crashy")).toBe(false);

    await mgr.stop("crashy");
  });

  it("gives up (disables) after exceeding the crash cap", async () => {
    const mgr = new ForkPluginWorkerManager({
      crashPolicy: { maxConsecutiveCrashes: 1, baseBackoffMs: 5 },
    });
    const events: WorkerEvent[] = [];
    mgr.onEvent((e) => events.push(e));

    await mgr.start("doomed", EXAMPLE, MIN_ENV);
    await expect(
      mgr.invoke("doomed", "invoke", { kind: "tool", name: "crash", args: {} }),
    ).rejects.toThrow();

    await waitFor(() => events.some((e) => e.type === "giveup"));
    expect(mgr.isDisabled("doomed")).toBe(true);
    expect(mgr.isRunning("doomed")).toBe(false);
    // No further invokes are accepted once disabled.
    await expect(
      mgr.invoke("doomed", "invoke", { kind: "tool", name: "echo", args: {} }),
    ).rejects.toThrow(/not available/);

    await mgr.stop("doomed");
  });
});
