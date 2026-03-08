import { describe, it, expect, vi, afterEach } from "vitest";
import { log, logWarn, logError, withTiming } from "../../app/api/_lib/logger";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("log() outputs structured JSON to console.info", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    log("test", "hello");

    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed.level).toBe("info");
    expect(parsed.tag).toBe("test");
    expect(parsed.message).toBe("hello");
    expect(parsed.timestamp).toBeDefined();
  });

  it("logWarn() outputs to console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logWarn("auth", "bad token");

    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed.level).toBe("warn");
    expect(parsed.tag).toBe("auth");
  });

  it("logError() outputs to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("db", "connection failed");

    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed.level).toBe("error");
  });

  it("includes request metadata when request is provided", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const req = new Request("http://localhost:3000/api/tasks?foo=bar", {
      method: "POST",
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
    });
    log("api", "created task", req);

    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed.ip).toBe("1.2.3.4");
    expect(parsed.method).toBe("POST");
    expect(parsed.path).toBe("/api/tasks");
  });

  it("omits request metadata when no request is provided", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    log("system", "startup");

    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed.ip).toBeUndefined();
    expect(parsed.method).toBeUndefined();
    expect(parsed.path).toBeUndefined();
  });
});

describe("withTiming", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the function result and logs duration", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await withTiming("api", "GET /api/tasks", undefined, async () => {
      return { data: [1, 2, 3] };
    });

    expect(result).toEqual({ data: [1, 2, 3] });
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed.message).toMatch(/GET \/api\/tasks completed in \d+ms/);
  });

  it("logs timing even when function throws", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(
      withTiming("api", "POST /api/fail", undefined, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(spy).toHaveBeenCalledOnce();
  });
});
