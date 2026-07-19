import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { isRuntimeKind, type RuntimeKind } from "@agentcenter/utils";

/**
 * Runner daemon configuration. Persisted as JSON (default ~/.agentcenter/runner.json) or supplied
 * via env. The apiKey authenticates as an Agent (Authorization: Bearer mc_…) — the same credential
 * every AgentCenter REST work-route accepts. The daemon is STATELESS: this config is all it keeps.
 */
export interface RunnerConfig {
  apiUrl: string;
  apiKey: string;
  pollIntervalMs: number;
  /** Which runtime an agent_task runs under, and the template for custom/shell kinds. */
  runtime: RuntimeKind;
  runtimeTemplate?: string[] | string;
  /** Directory the runner uses as a scratch workspace for task runs (cloned repos, bundle files). */
  workDir: string;
}

export const DEFAULT_CONFIG_PATH = join(homedir(), ".agentcenter", "runner.json");

const DEFAULTS = {
  pollIntervalMs: 5000,
  runtime: "openclaw" as RuntimeKind,
  workDir: join(homedir(), ".agentcenter", "work"),
};

/** Merge a partial config with env vars and defaults, validating required fields. */
export function resolveConfig(
  partial: Partial<RunnerConfig>,
  env: NodeJS.ProcessEnv = process.env,
): RunnerConfig {
  const apiUrl = partial.apiUrl ?? env.AGENTCENTER_API_URL ?? "";
  const apiKey = partial.apiKey ?? env.AGENTCENTER_API_KEY ?? "";
  if (!apiUrl) throw new Error("apiUrl is required (set AGENTCENTER_API_URL or run `login`)");
  if (!apiKey) throw new Error("apiKey is required (set AGENTCENTER_API_KEY or run `login`)");

  const runtimeRaw = partial.runtime ?? env.AGENTCENTER_RUNTIME ?? DEFAULTS.runtime;
  if (!isRuntimeKind(runtimeRaw)) throw new Error(`Unknown runtime: ${runtimeRaw}`);

  const pollIntervalMs =
    partial.pollIntervalMs ?? (Number(env.AGENTCENTER_POLL_MS) || DEFAULTS.pollIntervalMs);

  return {
    apiUrl: apiUrl.replace(/\/$/, ""),
    apiKey,
    pollIntervalMs,
    runtime: runtimeRaw,
    runtimeTemplate: partial.runtimeTemplate,
    workDir: partial.workDir ?? env.AGENTCENTER_WORK_DIR ?? DEFAULTS.workDir,
  };
}

export function loadConfigFile(path = DEFAULT_CONFIG_PATH): Partial<RunnerConfig> {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as Partial<RunnerConfig>;
}

export function saveConfigFile(config: Partial<RunnerConfig>, path = DEFAULT_CONFIG_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
}
