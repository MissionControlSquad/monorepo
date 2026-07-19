import { describe, it, expect, vi, afterEach } from "vitest";
import { execPlan } from "../src/executor.js";
import type { AdapterInvocation } from "@agentcenter/utils";

const httpPlan = (over: Partial<Extract<AdapterInvocation, { mode: "http" }>> = {}): AdapterInvocation => ({
  mode: "http",
  url: "https://hooks.example/run",
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ taskId: "t1" }),
  layout: { instructionsFile: "A", skillsDir: "s", identityFile: "I", taskFile: "T" },
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("execPlan http mode", () => {
  it("POSTs the webhook and maps a 2xx to a done result", async () => {
    const fetchMock = vi.fn(async () => new Response("ok-body", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await execPlan(httpPlan());
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hooks.example/run");
    expect(init.method).toBe("POST");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("ok-body");
  });

  it("maps a non-2xx to a failed result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500, statusText: "Err" })));
    const r = await execPlan(httpPlan());
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("500");
  });

  it("a fetch error becomes a failed result (no throw)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connect refused"); }));
    const r = await execPlan(httpPlan());
    expect(r.exitCode).toBeNull();
    expect(r.stderr).toContain("connect refused");
  });
});
