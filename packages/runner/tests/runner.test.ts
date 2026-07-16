import { describe, it, expect, vi } from "vitest";
import type { AgentContextBundle } from "@agentcenter/types";
import type { RunnerApi, RunnerCommandDTO, CommandResultPayload } from "../src/api-client.js";
import type { ExecFn, ExecResult } from "../src/executor.js";
import { runCommandsOnce, writeBundleFiles, prepareTaskRun, pollLoop } from "../src/runner.js";
import { resolveConfig } from "../src/config.js";

// A fake api that records posted results and hands back canned commands/context.
function fakeApi(overrides: Partial<RunnerApi> = {}): {
  api: RunnerApi;
  posted: { id: string; result: CommandResultPayload }[];
} {
  const posted: { id: string; result: CommandResultPayload }[] = [];
  const api: RunnerApi = {
    heartbeatPreflight: async () => ({ shouldWork: true }),
    getCommands: async () => [],
    postCommandResult: async (id, result) => {
      posted.push({ id, result });
    },
    getContext: async () => {
      throw new Error("not stubbed");
    },
    ...overrides,
  };
  return { api, posted };
}

const okExec = (result: Partial<ExecResult> = {}): ExecFn => {
  return vi.fn(async () => ({
    exitCode: 0,
    stdout: "out",
    stderr: "",
    timedOut: false,
    ...result,
  }));
};

const cmd = (over: Partial<RunnerCommandDTO> = {}): RunnerCommandDTO => ({
  id: "c1",
  command: "echo hi",
  cwd: null,
  timeoutMs: 1000,
  createdAt: "2026-01-01",
  ...over,
});

const bundle: AgentContextBundle = {
  version: 1,
  agent: { id: "a1", name: "Nova", role: "worker", personality: "keen", level: "senior" },
  instructions: [{ fileName: "AGENTS.md", content: "be good" }],
  skills: [{ key: "lint", name: "Lint", description: null, markdown: "# lint" }],
  task: {
    id: "t1",
    taskNumber: 42,
    title: "Fix nav",
    description: "broken",
    status: "assigned",
    priority: "high",
    tags: ["ui"],
    parentTaskId: null,
  },
  project: {
    id: "p1",
    name: "Site",
    description: null,
    sourceType: "remote_repo",
    repoUrl: "https://x/y.git",
    repoRef: "main",
  },
  deliverables: [{ id: "d1", title: "PR", kind: "link", content: null }],
  documents: [],
  subtasks: [{ id: "s1", title: "child", status: "inbox" }],
};

describe("runCommandsOnce", () => {
  it("runs each command and posts a done result", async () => {
    const { api, posted } = fakeApi({ getCommands: async () => [cmd(), cmd({ id: "c2" })] });
    const n = await runCommandsOnce(api, okExec());
    expect(n).toBe(2);
    expect(posted).toHaveLength(2);
    expect(posted[0].result).toMatchObject({ status: "done", exitCode: 0, stdout: "out" });
  });

  it("marks timeout when the exec times out", async () => {
    const { api, posted } = fakeApi({ getCommands: async () => [cmd()] });
    await runCommandsOnce(api, okExec({ timedOut: true, exitCode: null }));
    expect(posted[0].result.status).toBe("timeout");
  });

  it("marks failed when the exec throws", async () => {
    const { api, posted } = fakeApi({ getCommands: async () => [cmd()] });
    const exec: ExecFn = async () => {
      throw new Error("spawn boom");
    };
    await runCommandsOnce(api, exec);
    expect(posted[0].result).toMatchObject({ status: "failed", errorMessage: "spawn boom" });
  });

  it("passes cwd and timeout through to the executor", async () => {
    const exec = okExec();
    const { api } = fakeApi({ getCommands: async () => [cmd({ cwd: "/srv", timeoutMs: 500 })] });
    await runCommandsOnce(api, exec);
    expect(exec).toHaveBeenCalledWith("echo hi", { cwd: "/srv", timeoutMs: 500 });
  });
});

describe("writeBundleFiles", () => {
  it("writes identity/task/instructions/skills into the openclaw layout", async () => {
    const written: Record<string, string> = {};
    const paths = await writeBundleFiles(bundle, "openclaw", "/run", (p, c) => {
      written[p] = c;
    });
    expect(paths).toContain("IDENTITY.md");
    expect(paths).toContain("TASK.md");
    expect(paths).toContain("AGENTS.md");
    expect(paths.some((p) => p.includes(".openclaw/skills/lint.md"))).toBe(true);
    expect(written["/run/IDENTITY.md"]).toContain("Nova");
    expect(written["/run/TASK.md"]).toContain("Fix nav");
  });

  it("uses the generic skills dir for codex", async () => {
    const paths = await writeBundleFiles(bundle, "codex", "/run", () => {});
    expect(paths.some((p) => p === "skills/lint.md")).toBe(true);
  });
});

describe("prepareTaskRun", () => {
  it("fetches context, materialises it, and renders the runtime plan", async () => {
    const { api } = fakeApi({ getContext: async () => bundle });
    const { plan, written, bundle: got } = await prepareTaskRun(
      api,
      "t1",
      "openclaw",
      "/work",
      () => {},
    );
    expect(got.task.title).toBe("Fix nav");
    expect(plan.argv).toEqual(["openclaw", "run", "--task", "t1"]);
    expect(plan.cwd).toBe("/work/t1");
    expect(written.length).toBeGreaterThan(0);
  });
});

describe("pollLoop", () => {
  it("polls maxIterations times with an injected sleep", async () => {
    const getCommands = vi.fn(async () => []);
    const { api } = fakeApi({ getCommands });
    const sleep = vi.fn(async () => {});
    await pollLoop({ api, exec: okExec(), pollIntervalMs: 10, maxIterations: 3, sleep });
    expect(getCommands).toHaveBeenCalledTimes(3);
    // sleeps between iterations only (not after the last)
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("keeps polling after a transient poll error", async () => {
    let calls = 0;
    const getCommands = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("network blip");
      return [];
    });
    const { api } = fakeApi({ getCommands });
    await pollLoop({
      api,
      exec: okExec(),
      pollIntervalMs: 1,
      maxIterations: 2,
      sleep: async () => {},
    });
    expect(getCommands).toHaveBeenCalledTimes(2);
  });
});

describe("resolveConfig", () => {
  it("requires apiUrl and apiKey", () => {
    expect(() => resolveConfig({}, {})).toThrow(/apiUrl/);
    expect(() => resolveConfig({ apiUrl: "http://x" }, {})).toThrow(/apiKey/);
  });

  it("rejects an unknown runtime", () => {
    expect(() =>
      resolveConfig({ apiUrl: "http://x", apiKey: "k", runtime: "nope" as never }, {}),
    ).toThrow(/runtime/);
  });

  it("strips a trailing slash and applies defaults", () => {
    const c = resolveConfig({ apiUrl: "http://x/", apiKey: "k" }, {});
    expect(c.apiUrl).toBe("http://x");
    expect(c.runtime).toBe("openclaw");
    expect(c.pollIntervalMs).toBeGreaterThan(0);
  });

  it("reads from env when not passed explicitly", () => {
    const c = resolveConfig(
      {},
      { AGENTCENTER_API_URL: "http://env", AGENTCENTER_API_KEY: "envkey" } as NodeJS.ProcessEnv,
    );
    expect(c.apiUrl).toBe("http://env");
    expect(c.apiKey).toBe("envkey");
  });
});
