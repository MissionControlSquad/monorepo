/**
 * Novita sandbox provider — ported from Paperclip's novita plugin. SDK: `novita-sandbox`
 * (^1.0.3-b2), E2B-style. Provision: Sandbox.create(template?, {apiKey,timeoutMs,requestTimeoutMs})
 * → sandbox.sandboxId. Exec: sandbox.commands.run(cmd,{cwd,timeoutMs}) → {exitCode,stdout,stderr}
 * (throws a CommandError-shaped object on failure). Destroy: sandbox.kill({requestTimeoutMs}).
 */
import {
  DEFAULT_SANDBOX_LIFETIME_MS,
  defineCloudProvider,
  loadOptionalModule,
  loginShellCommand,
  type SandboxHandle,
} from "./types";

interface NovitaCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
interface NovitaSandbox {
  sandboxId: string;
  commands: {
    run(command: string, opts?: { cwd?: string; timeoutMs?: number }): Promise<NovitaCommandResult>;
  };
  kill(opts?: { requestTimeoutMs?: number }): Promise<void>;
}
interface NovitaCreateOpts {
  apiKey: string;
  timeoutMs?: number;
  requestTimeoutMs?: number;
}
interface NovitaModule {
  Sandbox: {
    create(
      templateOrOpts: string | NovitaCreateOpts,
      opts?: NovitaCreateOpts,
    ): Promise<NovitaSandbox>;
  };
}

const REQUEST_TIMEOUT_MS = 30_000;

export const novitaProvider = defineCloudProvider({
  key: "novita",
  displayName: "Novita",
  credentialKeys: ["NOVITA_API_KEY"],
  provision: async (creds, _ctx, spec): Promise<SandboxHandle> => {
    const { Sandbox } = await loadOptionalModule<NovitaModule>("novita-sandbox", "Novita");
    const opts: NovitaCreateOpts = {
      apiKey: creds.NOVITA_API_KEY,
      timeoutMs: DEFAULT_SANDBOX_LIFETIME_MS,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
    };
    const sandbox = spec?.image
      ? await Sandbox.create(spec.image, opts)
      : await Sandbox.create(opts);
    return {
      id: sandbox.sandboxId,
      providerKey: "novita",
      exec: async (command, cmdOpts) => {
        try {
          const r = await sandbox.commands.run(loginShellCommand(command, cmdOpts?.cwd), {
            timeoutMs: cmdOpts?.timeoutMs,
          });
          return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr };
        } catch (err) {
          // The SDK throws a CommandError-shaped object on non-zero exit / timeout.
          const e = err as {
            exitCode?: number;
            stdout?: string;
            stderr?: string;
            timedOut?: boolean;
          };
          if (typeof e.exitCode === "number" || e.timedOut) {
            return {
              exitCode: e.timedOut ? 124 : (e.exitCode ?? 1),
              stdout: e.stdout ?? "",
              stderr: e.stderr ?? "",
            };
          }
          throw err;
        }
      },
      destroy: async () => {
        await sandbox.kill({ requestTimeoutMs: REQUEST_TIMEOUT_MS });
      },
    };
  },
});
