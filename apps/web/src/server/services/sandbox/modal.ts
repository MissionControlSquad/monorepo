/**
 * Modal sandbox provider — ported from Paperclip's modal plugin. SDK: `modal` (^0.7.4, gRPC).
 * Two-key auth: new ModalClient({tokenId, tokenSecret}). Provision: apps.fromName(app,
 * {createIfMissing}) + images.fromRegistry(image) + sandboxes.create(app, image, params) →
 * sandbox.sandboxId. Exec: sandbox.exec(["sh","-lc",script], {timeoutMs, stdout:"pipe",
 * stderr:"pipe"}) then read stdout/stderr/wait() in parallel. Destroy: sandbox.terminate() +
 * client.close(). (Modal SDK wants Node 22+.)
 */
import {
  DEFAULT_SANDBOX_LIFETIME_MS,
  defineCloudProvider,
  loadOptionalModule,
  loginShellCommand,
  type SandboxHandle,
} from "./types";

interface ModalContainerProcess {
  stdout: { readText(): Promise<string> };
  stderr: { readText(): Promise<string> };
  wait(): Promise<number>;
}
interface ModalSandbox {
  sandboxId: string;
  exec(
    argv: string[],
    opts: { timeoutMs?: number; stdout: "pipe"; stderr: "pipe" },
  ): Promise<ModalContainerProcess>;
  terminate(): Promise<void>;
}
interface ModalClient {
  apps: {
    fromName(
      name: string,
      opts: { createIfMissing: boolean; environment?: string },
    ): Promise<unknown>;
  };
  images: { fromRegistry(ref: string): unknown };
  sandboxes: {
    create(app: unknown, image: unknown, params: Record<string, unknown>): Promise<ModalSandbox>;
  };
  close(): Promise<void>;
}
interface ModalModule {
  ModalClient: new (opts: {
    tokenId: string;
    tokenSecret: string;
    environment?: string;
  }) => ModalClient;
}

export const modalProvider = defineCloudProvider({
  key: "modal",
  displayName: "Modal",
  credentialEnvKeys: ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"],
  provision: async (spec, env): Promise<SandboxHandle> => {
    const { ModalClient } = await loadOptionalModule<ModalModule>("modal", "Modal");
    const client = new ModalClient({
      tokenId: env.MODAL_TOKEN_ID!,
      tokenSecret: env.MODAL_TOKEN_SECRET!,
      environment: env.MODAL_ENVIRONMENT || undefined,
    });
    const app = await client.apps.fromName("agentcenter", {
      createIfMissing: true,
      environment: env.MODAL_ENVIRONMENT || undefined,
    });
    const image = client.images.fromRegistry(spec?.image ?? "python:3.13");
    const sandbox = await client.sandboxes.create(app, image, {
      workdir: "/workspace",
      timeoutMs: DEFAULT_SANDBOX_LIFETIME_MS,
    });
    return {
      id: sandbox.sandboxId,
      providerKey: "modal",
      exec: async (command, opts) => {
        const proc = await sandbox.exec(["sh", "-lc", loginShellCommand(command, opts?.cwd)], {
          timeoutMs: opts?.timeoutMs,
          stdout: "pipe",
          stderr: "pipe",
        });
        const [stdout, stderr, exitCode] = await Promise.all([
          proc.stdout.readText(),
          proc.stderr.readText(),
          proc.wait(),
        ]);
        return { exitCode, stdout, stderr };
      },
      destroy: async () => {
        try {
          await sandbox.terminate();
        } finally {
          await client.close().catch(() => {});
        }
      },
    };
  },
});
