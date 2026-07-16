import { pathToFileURL } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  resolveConfig,
  loadConfigFile,
  saveConfigFile,
  DEFAULT_CONFIG_PATH,
  type RunnerConfig,
} from "./config.js";
import { HttpRunnerApi } from "./api-client.js";
import { execShell, execPlan } from "./executor.js";
import type { AgentContextProject } from "@agentcenter/types";
import {
  pollLoop,
  runCommandsOnce,
  runTaskOnce,
  type RunnerLogger,
  type TaskRunDeps,
} from "./runner.js";

const logger: RunnerLogger = {
  info: (m) => console.log(`[runner] ${m}`),
  error: (m) => console.error(`[runner] ${m}`),
};

function parseFlags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

function configFromFileAndEnv(overrides: Partial<RunnerConfig> = {}): RunnerConfig {
  return resolveConfig({ ...loadConfigFile(), ...overrides });
}

/** Write a bundle file to disk, creating parent dirs. */
function realWriteFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** Shallow-clone the project repo into the run dir (or pull if it already exists). */
async function realCloneRepo(project: AgentContextProject, dir: string): Promise<void> {
  if (!project.repoUrl) return;
  const ref = project.repoRef ? `--branch '${project.repoRef}'` : "";
  const res = await execShell(
    `git clone --depth 1 ${ref} '${project.repoUrl}' '${dir}' 2>/dev/null || (cd '${dir}' && git pull)`,
    { timeoutMs: 180_000 },
  );
  if (res.exitCode !== 0) throw new Error(`git clone/pull failed: ${res.stderr.slice(0, 300)}`);
}

/** Assemble the task-run dependencies (real fs, git, and process spawn) from config. */
function buildTaskDeps(config: RunnerConfig): TaskRunDeps {
  return {
    runtime: config.runtime,
    workDir: config.workDir,
    writeFile: realWriteFile,
    execPlan,
    template: config.runtimeTemplate,
    cloneRepo: realCloneRepo,
  };
}

function cmdLogin(flags: Record<string, string>): void {
  const apiUrl = flags["api-url"] ?? process.env.AGENTCENTER_API_URL;
  const apiKey = flags["api-key"] ?? process.env.AGENTCENTER_API_KEY;
  if (!apiUrl || !apiKey) {
    logger.error("login requires --api-url and --api-key");
    process.exit(1);
  }
  const existing = loadConfigFile();
  const config: Partial<RunnerConfig> = {
    ...existing,
    apiUrl,
    apiKey,
    ...(flags.runtime ? { runtime: flags.runtime as RunnerConfig["runtime"] } : {}),
  };
  saveConfigFile(config);
  logger.info(`saved credentials to ${DEFAULT_CONFIG_PATH}`);
}

async function cmdStart(flags: Record<string, string>): Promise<void> {
  const config = configFromFileAndEnv(
    flags["poll-ms"] ? { pollIntervalMs: Number(flags["poll-ms"]) } : {},
  );
  const api = new HttpRunnerApi(config.apiUrl, config.apiKey);
  // --commands-only skips agent-task execution (raw RunnerCommands still run).
  const taskDeps = flags["commands-only"] ? undefined : buildTaskDeps(config);
  logger.info(
    `polling ${config.apiUrl} every ${config.pollIntervalMs}ms (runtime: ${config.runtime}` +
      `${taskDeps ? "" : ", commands only"})`,
  );
  await pollLoop({
    api,
    exec: execShell,
    pollIntervalMs: config.pollIntervalMs,
    taskDeps,
    log: logger,
  });
}

async function cmdRunOnce(): Promise<void> {
  const config = configFromFileAndEnv();
  const api = new HttpRunnerApi(config.apiUrl, config.apiKey);
  const n = await runCommandsOnce(api, execShell, logger);
  logger.info(`processed ${n} command(s)`);
}

async function cmdRunTask(rest: string[]): Promise<void> {
  const taskId = rest.find((a) => !a.startsWith("--"));
  if (!taskId) {
    logger.error("run-task requires a <taskId>");
    process.exit(1);
  }
  const config = configFromFileAndEnv();
  const api = new HttpRunnerApi(config.apiUrl, config.apiKey);
  const result = await runTaskOnce(api, taskId, buildTaskDeps(config), logger);
  logger.info(`task ${taskId} finished (exit ${result.exitCode})`);
}

function usage(): void {
  console.log(
    [
      "agentcenter-runner — stateless, outbound-only runner daemon",
      "",
      "Usage:",
      "  agentcenter-runner login --api-url <url> --api-key <mc_key> [--runtime openclaw|codex|custom|shell]",
      "  agentcenter-runner start [--poll-ms <ms>] [--commands-only]",
      "  agentcenter-runner run-once            (process queued raw commands once)",
      "  agentcenter-runner run-task <taskId>   (run one agent task end-to-end)",
      "",
      "Config: " + DEFAULT_CONFIG_PATH + " (or AGENTCENTER_API_URL / AGENTCENTER_API_KEY env)",
    ].join("\n"),
  );
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  switch (command) {
    case "login":
      cmdLogin(flags);
      break;
    case "start":
      await cmdStart(flags);
      break;
    case "run-once":
      await cmdRunOnce();
      break;
    case "run-task":
      await cmdRunTask(rest);
      break;
    case undefined:
    case "help":
    case "--help":
      usage();
      break;
    default:
      logger.error(`unknown command: ${command}`);
      usage();
      process.exit(1);
  }
}

// Run when invoked as a binary (not when imported by tests). pathToFileURL handles paths with
// spaces / special chars, which a raw `file://` + argv[1] compare would mismatch on.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
