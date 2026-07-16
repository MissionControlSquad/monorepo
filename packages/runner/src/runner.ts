import { join } from "node:path";
import {
  renderRuntimeCommand,
  runtimeLayout,
  type RuntimeKind,
  type RenderedRuntime,
} from "@agentcenter/utils";
import type { AgentContextBundle } from "@agentcenter/types";
import type { RunnerApi } from "./api-client.js";
import type { ExecFn } from "./executor.js";

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

export interface PollLoopOptions {
  api: RunnerApi;
  exec: ExecFn;
  pollIntervalMs: number;
  log?: RunnerLogger;
  /** Test hook: stop after N iterations. Undefined = run forever. */
  maxIterations?: number;
  /** Injectable sleep so tests don't wait real time. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Run the command poll on an interval until stopped. */
export async function pollLoop(opts: PollLoopOptions): Promise<void> {
  const log = opts.log ?? noopLogger;
  const sleep = opts.sleep ?? realSleep;
  let i = 0;
  for (;;) {
    try {
      const n = await runCommandsOnce(opts.api, opts.exec, log);
      if (n === 0) log.info("no work");
    } catch (err) {
      log.error(`poll error: ${err instanceof Error ? err.message : String(err)}`);
    }
    i += 1;
    if (opts.maxIterations != null && i >= opts.maxIterations) return;
    await sleep(opts.pollIntervalMs);
  }
}
