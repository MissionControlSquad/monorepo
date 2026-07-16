/**
 * E2B sandbox provider — ported from Paperclip's e2b plugin (packages/plugins/sandbox-providers/e2b).
 * SDK: `e2b` (^2.19.0). Provision: Sandbox.create(template, {apiKey,timeoutMs}). Exec:
 * sandbox.commands.run(cmd,{cwd,timeoutMs}) (non-zero exit throws CommandExitError w/ exitCode/stdout/
 * stderr). Destroy: sandbox.kill().
 */
import {
  DEFAULT_SANDBOX_LIFETIME_MS,
  defineCloudProvider,
  loadOptionalModule,
  loginShellCommand,
  type SandboxHandle,
} from "./types";

// Minimal surface of the `e2b` SDK we use (real shapes from the Paperclip plugin).
interface E2bCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
interface E2bSandbox {
  sandboxId: string;
  setTimeout(timeoutMs: number): Promise<void>;
  commands: {
    run(command: string, opts?: { cwd?: string; timeoutMs?: number }): Promise<E2bCommandResult>;
  };
  kill(): Promise<void>;
}
interface E2bModule {
  Sandbox: {
    create(
      template: string,
      opts: { apiKey: string; timeoutMs?: number; metadata?: Record<string, string> },
    ): Promise<E2bSandbox>;
  };
}

export const e2bProvider = defineCloudProvider({
  key: "e2b",
  displayName: "E2B",
  credentialKeys: ["E2B_API_KEY"],
  provision: async (creds, _ctx, spec): Promise<SandboxHandle> => {
    const { Sandbox } = await loadOptionalModule<E2bModule>("e2b", "E2B");
    const sandbox = await Sandbox.create(spec?.image ?? "base", {
      apiKey: creds.E2B_API_KEY,
      timeoutMs: DEFAULT_SANDBOX_LIFETIME_MS,
      metadata: { agentcenterProvider: "e2b" },
    });
    return {
      id: sandbox.sandboxId,
      providerKey: "e2b",
      exec: async (command, opts) => {
        // Refresh the sandbox death-clock, best-effort (matches Paperclip).
        await sandbox.setTimeout(DEFAULT_SANDBOX_LIFETIME_MS).catch(() => {});
        try {
          const r = await sandbox.commands.run(loginShellCommand(command, opts?.cwd), {
            timeoutMs: opts?.timeoutMs,
          });
          return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr };
        } catch (err) {
          // CommandExitError carries exitCode/stdout/stderr for non-zero exits.
          const e = err as { exitCode?: number; stdout?: string; stderr?: string };
          if (typeof e.exitCode === "number") {
            return { exitCode: e.exitCode, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
          }
          throw err;
        }
      },
      destroy: async () => {
        await sandbox.kill();
      },
    };
  },
});
