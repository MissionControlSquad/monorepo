import { describe, it, expect, vi } from "vitest";
import type { AgentContextBundle, AgentContextProject } from "@agentcenter/types";
import type { RunnerApi, RunnerCommandDTO, CommandResultPayload } from "../src/api-client.js";
import type { ExecFn, ExecResult } from "../src/executor.js";
import { getAdapter, type AdapterInvocation } from "@agentcenter/utils";
import {
  runCommandsOnce,
  writeBundleFiles,
  prepareTaskRun,
  pollLoop,
  runTaskOnce,
  runQueuedTasksOnce,
  type TaskRunDeps,
} from "../src/runner.js";
import { resolveConfig } from "../src/config.js";

interface Recorder {
  posted: { id: string; result: CommandResultPayload }[];
  messages: { taskId: string; content: string }[];
  statuses: { taskId: string; status: string }[];
}

// A fake api that records posted results/messages/statuses and hands back canned commands/context.
function fakeApi(overrides: Partial<RunnerApi> = {}): { api: RunnerApi } & Recorder {
  const rec: Recorder = { posted: [], messages: [], statuses: [] };
  const api: RunnerApi = {
    heartbeatPreflight: async () => ({ shouldWork: true }),
    getCommands: async () => [],
    postCommandResult: async (id, result) => {
      rec.posted.push({ id, result });
    },
    getContext: async () => {
      throw new Error("not stubbed");
    },
    getQueue: async () => [],
    postTaskMessage: async (taskId, content) => {
      rec.messages.push({ taskId, content });
    },
    setTaskStatus: async (taskId, status) => {
      rec.statuses.push({ taskId, status });
    },
    postDeliverable: async () => {},
    ...overrides,
  };
  return { api, ...rec };
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

  it("a failed result-post does not abort the batch or mislabel a success", async () => {
    const attempts: string[] = [];
    const api: RunnerApi = {
      ...fakeApi().api,
      getCommands: async () => [cmd({ id: "c1" }), cmd({ id: "c2" })],
      postCommandResult: async (id, result) => {
        attempts.push(`${id}:${result.status}`);
        if (id === "c1") throw new Error("network blip"); // first post fails
      },
    };
    const n = await runCommandsOnce(api, okExec());
    expect(n).toBe(2);
    // both commands attempted a post; c1 was reported "done" (not mislabeled "failed"); c2 still ran
    expect(attempts).toEqual(["c1:done", "c2:done"]);
  });
});

describe("writeBundleFiles", () => {
  it("writes identity/task/instructions/skills into the openclaw layout", async () => {
    const written: Record<string, string> = {};
    const openclawLayout = getAdapter("openclaw")!.build({ taskId: "x", workspaceDir: "/run" }).layout;
    const paths = await writeBundleFiles(bundle, openclawLayout, "/run", (p, c) => {
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
    const codexLayout = getAdapter("codex")!.build({ taskId: "x", workspaceDir: "/run" }).layout;
    const paths = await writeBundleFiles(bundle, codexLayout, "/run", () => {});
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
    if (plan.mode !== "spawn") throw new Error("expected a spawn plan");
    expect(plan.argv).toEqual(["openclaw", "run", "--task", "t1"]);
    expect(plan.cwd).toBe("/work/t1");
    expect(written.length).toBeGreaterThan(0);
  });

  it("http adapter produces an http plan and writes no bundle files", async () => {
    const { api } = fakeApi({ getContext: async () => bundle });
    const { plan, written } = await prepareTaskRun(
      api,
      "t1",
      "http",
      "/work",
      () => {
        throw new Error("should not write files for http mode");
      },
      "https://hooks.example/agent?task={taskId}",
    );
    if (plan.mode !== "http") throw new Error("expected an http plan");
    expect(plan.url).toBe("https://hooks.example/agent?task=t1");
    expect(plan.method).toBe("POST");
    expect(JSON.parse(plan.body)).toMatchObject({ taskId: "t1" });
    expect(written).toEqual([]);
  });
});

const okExecPlan = (result: Partial<ExecResult> = {}) =>
  vi.fn(async (_plan: AdapterInvocation) => ({
    exitCode: 0,
    stdout: "task output",
    stderr: "",
    timedOut: false,
    ...result,
  }));

function taskDeps(execPlan: ReturnType<typeof okExecPlan>, over: Partial<TaskRunDeps> = {}): TaskRunDeps {
  return {
    runtime: "openclaw",
    workDir: "/work",
    writeFile: () => {},
    execPlan,
    ...over,
  };
}

describe("runTaskOnce", () => {
  it("fetches context, runs the plan, reports output, and sets review on success", async () => {
    const { api, messages, statuses } = fakeApi({ getContext: async () => bundle });
    const execPlan = okExecPlan();
    const result = await runTaskOnce(api, "t1", taskDeps(execPlan));
    expect(result.exitCode).toBe(0);
    expect(execPlan).toHaveBeenCalledOnce();
    expect(messages).toEqual([{ taskId: "t1", content: "task output" }]);
    // in_progress before the run, review after
    expect(statuses).toEqual([
      { taskId: "t1", status: "in_progress" },
      { taskId: "t1", status: "review" },
    ]);
  });

  it("marks blocked on a non-zero exit and includes stderr in the message", async () => {
    const { api, messages, statuses } = fakeApi({ getContext: async () => bundle });
    await runTaskOnce(api, "t1", taskDeps(okExecPlan({ exitCode: 2, stderr: "boom" })));
    expect(messages[0].content).toContain("boom");
    expect(statuses.at(-1)).toEqual({ taskId: "t1", status: "blocked" });
  });

  it("clones the repo when the project has a repoUrl", async () => {
    const { api } = fakeApi({ getContext: async () => bundle });
    const cloneRepo = vi.fn(async (_p: AgentContextProject, _d: string) => {});
    await runTaskOnce(api, "t1", taskDeps(okExecPlan(), { cloneRepo }));
    expect(cloneRepo).toHaveBeenCalledOnce();
    expect(cloneRepo.mock.calls[0][0]).toMatchObject({ repoUrl: "https://x/y.git" });
  });
});

describe("runQueuedTasksOnce", () => {
  it("runs only queue items that reference a task", async () => {
    const { api, statuses } = fakeApi({
      getContext: async () => bundle,
      getQueue: async () => [
        { id: "q1", taskId: "t1", title: "a", status: "pending" },
        { id: "q2", taskId: null, title: "no task", status: "pending" },
      ],
    });
    const n = await runQueuedTasksOnce(api, taskDeps(okExecPlan()));
    expect(n).toBe(1);
    expect(statuses.some((s) => s.taskId === "t1" && s.status === "review")).toBe(true);
  });

  it("reports a task that throws and keeps going", async () => {
    let calls = 0;
    const { api, statuses, messages } = fakeApi({
      getContext: async () => {
        calls++;
        if (calls === 1) throw new Error("context fetch failed");
        return bundle;
      },
      getQueue: async () => [
        { id: "q1", taskId: "t1", title: "bad", status: "pending" },
        { id: "q2", taskId: "t2", title: "good", status: "pending" },
      ],
    });
    const n = await runQueuedTasksOnce(api, taskDeps(okExecPlan()));
    expect(n).toBe(2);
    // t1 failed → blocked with an error message; t2 still ran → review
    expect(messages.some((m) => m.taskId === "t1" && m.content.includes("context fetch failed"))).toBe(true);
    expect(statuses.some((s) => s.taskId === "t1" && s.status === "blocked")).toBe(true);
    expect(statuses.some((s) => s.taskId === "t2" && s.status === "review")).toBe(true);
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
