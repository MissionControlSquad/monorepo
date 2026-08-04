import { describe, it, expect } from "vitest";
import {
  buildMinimalWorkerEnv,
  isSecretEnvKey,
  frameJsonRpc,
  parseNdjson,
  pluginCrashPolicy,
} from "@agentcenter/utils";

describe("buildMinimalWorkerEnv (#123/#129 security core)", () => {
  it("passes only allowlisted keys, never the host env wholesale", () => {
    const base = {
      PATH: "/usr/bin",
      HOME: "/root",
      DATABASE_URL: "postgres://secret",
      NODE_ENV: "prod",
    };
    const env = buildMinimalWorkerEnv(base, ["PATH", "NODE_ENV"]);
    expect(env).toEqual({ PATH: "/usr/bin", NODE_ENV: "prod" });
    expect(env.HOME).toBeUndefined();
  });

  it("refuses a secret-named key even if it is allowlisted (leak guard)", () => {
    const base = {
      DATABASE_URL: "postgres://x",
      OPENAI_API_KEY: "sk-x",
      FOO_TOKEN: "t",
      SAFE: "ok",
    };
    const env = buildMinimalWorkerEnv(base, [
      "DATABASE_URL",
      "OPENAI_API_KEY",
      "FOO_TOKEN",
      "SAFE",
    ]);
    expect(env).toEqual({ SAFE: "ok" });
  });

  it("secret-filters extra values too", () => {
    const env = buildMinimalWorkerEnv({}, [], { PLUGIN_MODE: "dev", MY_SECRET: "leak" });
    expect(env).toEqual({ PLUGIN_MODE: "dev" });
  });

  it("isSecretEnvKey flags the obvious offenders", () => {
    expect(isSecretEnvKey("DATABASE_URL")).toBe(true);
    expect(isSecretEnvKey("AWS_SECRET_ACCESS_KEY")).toBe(true);
    expect(isSecretEnvKey("PATH")).toBe(false);
  });
});

describe("NDJSON JSON-RPC codec (#123/#129)", () => {
  it("frames and round-trips a message", () => {
    const line = frameJsonRpc({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(line.endsWith("\n")).toBe(true);
    const { messages, rest } = parseNdjson(line);
    expect(messages).toEqual([{ jsonrpc: "2.0", id: 1, method: "ping" }]);
    expect(rest).toBe("");
  });

  it("buffers a partial trailing line for the next chunk", () => {
    const a = parseNdjson('{"jsonrpc":"2.0","id":1}\n{"jsonrpc":"2.0"');
    expect(a.messages).toHaveLength(1);
    expect(a.rest).toBe('{"jsonrpc":"2.0"');
    const b = parseNdjson(a.rest + ',"id":2}\n');
    expect(b.messages).toHaveLength(1);
    expect((b.messages[0] as { id: number }).id).toBe(2);
  });

  it("skips a corrupt frame without desyncing the stream", () => {
    const { messages, errors } = parseNdjson('not json\n{"jsonrpc":"2.0","id":9}\n');
    expect(messages).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });
});

describe("pluginCrashPolicy (#129)", () => {
  it("restarts with exponential backoff below the cap", () => {
    expect(pluginCrashPolicy(1, { baseBackoffMs: 1000 })).toMatchObject({
      action: "restart",
      backoffMs: 1000,
    });
    expect(pluginCrashPolicy(3, { baseBackoffMs: 1000 }).backoffMs).toBe(4000);
  });

  it("gives up after the max consecutive crashes", () => {
    expect(pluginCrashPolicy(10, { maxConsecutiveCrashes: 10 })).toMatchObject({
      action: "giveup",
    });
  });
});
