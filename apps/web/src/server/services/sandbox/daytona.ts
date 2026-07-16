/**
 * Daytona sandbox provider — ported from Paperclip's daytona plugin. SDK: `@daytonaio/sdk`
 * (^0.171.0). Client: new Daytona({apiKey, apiUrl?}). Provision: client.create({image,...},
 * {timeout: seconds}) → sandbox.id; start if not "started". Exec: sandbox.process.executeCommand(cmd,
 * cwd, env, timeoutSec) → {exitCode, result} (combined stdout+stderr in `result`, exit returned
 * inline). Destroy: sandbox.delete(seconds).
 */
import {
  defineCloudProvider,
  loadOptionalModule,
  shellQuote,
  withCwd,
  type SandboxHandle,
} from "./types";

interface DaytonaExecResult {
  exitCode?: number;
  result?: string;
  artifacts?: { stdout?: string };
}
interface DaytonaSandbox {
  id: string;
  state?: string;
  start(timeoutSec?: number): Promise<void>;
  process: {
    executeCommand(
      command: string,
      cwd?: string,
      env?: Record<string, string>,
      timeoutSec?: number,
    ): Promise<DaytonaExecResult>;
  };
  delete(timeoutSec?: number): Promise<void>;
}
interface DaytonaClient {
  create(params: Record<string, unknown>, opts?: { timeout?: number }): Promise<DaytonaSandbox>;
  get(id: string): Promise<DaytonaSandbox>;
}
interface DaytonaConfig {
  apiKey: string;
  apiUrl?: string;
}
interface DaytonaModule {
  Daytona: new (config: DaytonaConfig) => DaytonaClient;
}

const DEFAULT_TIMEOUT_SEC = 300;

export const daytonaProvider = defineCloudProvider({
  key: "daytona",
  displayName: "Daytona",
  credentialEnvKeys: ["DAYTONA_API_KEY"],
  provision: async (spec, env): Promise<SandboxHandle> => {
    const { Daytona } = await loadOptionalModule<DaytonaModule>("@daytonaio/sdk", "Daytona");
    const client = new Daytona({
      apiKey: env.DAYTONA_API_KEY!,
      apiUrl: env.DAYTONA_API_URL || undefined,
    });
    // Daytona requires an image (or snapshot). Operator-overridable via env; documented default.
    const image = spec?.image ?? env.DAYTONA_SANDBOX_IMAGE ?? "ubuntu:22.04";
    const sandbox = await client.create(
      {
        image,
        labels: { "agentcenter-provider": "daytona" },
        autoStopInterval: 15,
        autoDeleteInterval: 7 * 24 * 60,
      },
      { timeout: DEFAULT_TIMEOUT_SEC },
    );
    return {
      id: sandbox.id,
      providerKey: "daytona",
      exec: async (command, opts) => {
        if (sandbox.state && sandbox.state !== "started") {
          await sandbox.start(DEFAULT_TIMEOUT_SEC).catch(() => {});
        }
        const timeoutSec = opts?.timeoutMs ? Math.ceil(opts.timeoutMs / 1000) : DEFAULT_TIMEOUT_SEC;
        const wrapped = `bash -lc ${shellQuote(withCwd(command, opts?.cwd))}`;
        const r = await sandbox.process.executeCommand(wrapped, undefined, undefined, timeoutSec);
        // executeCommand returns combined stdout+stderr in `result`; stderr is left empty (Paperclip).
        return {
          exitCode: typeof r.exitCode === "number" ? r.exitCode : 1,
          stdout: r.result ?? r.artifacts?.stdout ?? "",
          stderr: "",
        };
      },
      destroy: async () => {
        await sandbox.delete(DEFAULT_TIMEOUT_SEC);
      },
    };
  },
});
