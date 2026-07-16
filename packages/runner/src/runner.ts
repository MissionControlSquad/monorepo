import { join } from "node:path";
import {
  renderRuntimeCommand,
  runtimeLayout,
  type RuntimeKind,
  type RenderedRuntime,
} from "@agentcenter/utils";
import type { AgentContextBundle, AgentContextProject } from "@agentcenter/types";
import type { RunnerApi } from "./api-client.js";
import type { ExecFn, ExecPlanFn, ExecResult } from "./executor.js";

/** Sink for writing bundle files — real fs in prod, a recorder in tests. */
export type WriteFileFn = (path: string, content: string) => void | Promise<void>;

export interface RunnerLogger {
  info(msg: string): void;
  error(msg: string): void;
}

const noopLogger: RunnerLogger = { info: () => {}, error: () => {} };

/**
 * Pull this runner's queued raw commands, execute each locally, and post the result. This is the
 * fully self-contained, unit-testable core of the daemon: no git, no runtime spawn, no network
 * except the injected api. Returns the number of commands processed.
 */
export async function runCommandsOnce(
  api: RunnerApi,
  exec: ExecFn,
  log: RunnerLogger = noopLogger,
): Promise<number> {
  const commands = await api.getCommands();
  for (const c of commands) {
    log.info(`running command ${c.id}: ${c.command}`);
    try {
      const r = await exec(c.command, { cwd: c.cwd ?? undefined, timeoutMs: c.timeoutMs });
      await api.postCommandResult(c.id, {
        exitCode: r.exitCode,
        stdout: r.stdout,
        stderr: r.stderr,
        status: r.timedOut ? "timeout" : "done",
      });
      log.info(`command ${c.id} finished (exit ${r.exitCode})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await api.postCommandResult(c.id, { status: "failed", errorMessage: message });
      log.error(`command ${c.id} failed: ${message}`);
    }
  }
  return commands.length;
}

/** Render a bundle's identity/instructions/skills/task into human-readable markdown. */
function identityMarkdown(b: AgentContextBundle): string {
  const a = b.agent;
  return [`# ${a.name}`, `Role: ${a.role}`, a.level ? `Level: ${a.level}` : "", a.personality ?? ""]
    .filter(Boolean)
    .join("\n");
}

function taskMarkdown(b: AgentContextBundle): string {
  const t = b.task;
  const lines = [`# Task #${t.taskNumber}: ${t.title}`, "", t.description, ""];
  if (b.project?.repoUrl) lines.push(`Repo: ${b.project.repoUrl} @ ${b.project.repoRef ?? "HEAD"}`);
  if (b.deliverables.length)
    lines.push("", "## Deliverables", ...b.deliverables.map((d) => `- ${d.title} (${d.kind})`));
  if (b.subtasks.length)
    lines.push("", "## Subtasks", ...b.subtasks.map((s) => `- [${s.status}] ${s.title}`));
  return lines.join("\n");
}

/**
 * Materialise a context bundle into the file layout the runtime expects, under `rootDir`. Pure
 * except for the injected writer, so it is unit-testable without touching a real filesystem.
 * Returns the relative paths written.
 */
export async function writeBundleFiles(
  bundle: AgentContextBundle,
  kind: RuntimeKind,
  rootDir: string,
  writeFile: WriteFileFn,
): Promise<string[]> {
  const layout = runtimeLayout(kind);
  const written: string[] = [];

  const write = async (rel: string, content: string) => {
    await writeFile(join(rootDir, rel), content);
    written.push(rel);
  };

  await write(layout.identityFile, identityMarkdown(bundle));
  await write(layout.taskFile, taskMarkdown(bundle));
  if (bundle.instructions.length) {
    // Concatenate instruction files into the primary AGENTS.md-style file.
    await write(layout.instructionsFile, bundle.instructions.map((i) => i.content).join("\n\n---\n\n"));
  }
  for (const skill of bundle.skills) {
    await write(join(layout.skillsDir, `${skill.key}.md`), skill.markdown);
  }
  return written;
}

/**
 * The stateless per-task cycle: fetch the context bundle, materialise it, and render the runtime
 * spawn plan. The actual `git clone` + process spawn are the machine-specific steps a real deployment
 * performs (flagged infra); this function returns the plan so they can be executed or inspected.
 */
export async function prepareTaskRun(
  api: RunnerApi,
  taskId: string,
  kind: RuntimeKind,
  workDir: string,
  writeFile: WriteFileFn,
  template?: string[] | string,
): Promise<{ bundle: AgentContextBundle; written: string[]; plan: RenderedRuntime }> {
  const bundle = await api.getContext(taskId);
  const runDir = join(workDir, taskId);
  const written = await writeBundleFiles(bundle, kind, runDir, writeFile);
  const plan = renderRuntimeCommand(kind, {
    taskId,
    workspaceDir: runDir,
    taskTitle: bundle.task.title,
    prompt: taskMarkdown(bundle),
    template,
  });
  return { bundle, written, plan };
}

/** Everything runTaskOnce needs to execute a task run, all injectable for tests. */
export interface TaskRunDeps {
  runtime: RuntimeKind;
  workDir: string;
  writeFile: WriteFileFn;
  execPlan: ExecPlanFn;
  template?: string[] | string;
  /** Check out the project repo into the run dir. Real git in prod; omitted/no-op in tests. */
  cloneRepo?: (project: AgentContextProject, dir: string) => Promise<void>;
  timeoutMs?: number;
}

/**
 * The stateless per-task run: fetch context → (clone repo) → materialise the bundle → spawn the
 * runtime → report output as a task message + set status. Holds nothing after it returns. The git
 * clone and the real runtime binary are the only machine-specific pieces (injected); the
 * fetch→materialise→spawn→report orchestration is fully exercised with fakes.
 */
export async function runTaskOnce(
  api: RunnerApi,
  taskId: string,
  deps: TaskRunDeps,
  log: RunnerLogger = noopLogger,
): Promise<ExecResult> {
  const { bundle, plan } = await prepareTaskRun(
    api,
    taskId,
    deps.runtime,
    deps.workDir,
    deps.writeFile,
    deps.template,
  );
  if (deps.cloneRepo && bundle.project?.repoUrl) {
    log.info(`cloning ${bundle.project.repoUrl} for task ${taskId}`);
    await deps.cloneRepo(bundle.project, plan.cwd);
  }

  await api.setTaskStatus(taskId, "in_progress");
  log.info(`running task ${taskId} via ${deps.runtime}`);
  const result = await deps.execPlan(plan, { timeoutMs: deps.timeoutMs ?? 600_000 });

  const output = [result.stdout, result.stderr ? `\n[stderr]\n${result.stderr}` : ""]
    .join("")
    .slice(-45_000);
  await api.postTaskMessage(taskId, output || "(runner produced no output)");
  const finalStatus = result.timedOut || result.exitCode !== 0 ? "blocked" : "review";
  await api.setTaskStatus(taskId, finalStatus);
  log.info(`task ${taskId} → ${finalStatus} (exit ${result.exitCode})`);
  return result;
}

/**
 * Pull this agent's active queue, run each item that references a task, and report. A failure on one
 * task is reported (message + blocked) and does not stop the others. Returns the number attempted.
 */
export async function runQueuedTasksOnce(
  api: RunnerApi,
  deps: TaskRunDeps,
  log: RunnerLogger = noopLogger,
): Promise<number> {
  const queue = await api.getQueue();
  const tasks = queue.filter((q) => q.taskId);
  for (const item of tasks) {
    const taskId = item.taskId as string;
    try {
      await runTaskOnce(api, taskId, deps, log);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`task ${taskId} failed: ${message}`);
      await api.postTaskMessage(taskId, `Runner error: ${message}`).catch(() => {});
      await api.setTaskStatus(taskId, "blocked").catch(() => {});
    }
  }
  return tasks.length;
}

export interface PollLoopOptions {
  api: RunnerApi;
  exec: ExecFn;
  pollIntervalMs: number;
  log?: RunnerLogger;
  /** When provided, each poll also pulls + runs the agent's queued TASKS (not just raw commands). */
  taskDeps?: TaskRunDeps;
  /** Test hook: stop after N iterations. Undefined = run forever. */
  maxIterations?: number;
  /** Injectable sleep so tests don't wait real time. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Run the command poll (and, if configured, the task poll) on an interval until stopped. */
export async function pollLoop(opts: PollLoopOptions): Promise<void> {
  const log = opts.log ?? noopLogger;
  const sleep = opts.sleep ?? realSleep;
  let i = 0;
  for (;;) {
    try {
      const commands = await runCommandsOnce(opts.api, opts.exec, log);
      const tasks = opts.taskDeps ? await runQueuedTasksOnce(opts.api, opts.taskDeps, log) : 0;
      if (commands === 0 && tasks === 0) log.info("no work");
    } catch (err) {
      log.error(`poll error: ${err instanceof Error ? err.message : String(err)}`);
    }
    i += 1;
    if (opts.maxIterations != null && i >= opts.maxIterations) return;
    await sleep(opts.pollIntervalMs);
  }
}
