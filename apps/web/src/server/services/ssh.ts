import { Client } from "ssh2";

export interface SSHConfig {
  host: string;
  port?: number;
  username?: string;
  privateKey: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Execute a command over SSH.
 */
export function sshExec(
  config: SSHConfig,
  command: string,
  opts?: { timeoutMs?: number },
): Promise<ExecResult> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        conn.end();
        reject(new Error(`SSH command timed out after ${timeoutMs}ms: ${command.slice(0, 100)}`));
      }, timeoutMs);
    }

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            conn.end();
            return reject(err);
          }

          let stdout = "";
          let stderr = "";

          stream.on("data", (data: Buffer) => {
            stdout += data.toString();
          });
          stream.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
          });
          stream.on("close", (code: number) => {
            clearTimeout(timer);
            conn.end();
            resolve({ stdout, stderr, code: code ?? 0 });
          });
        });
      })
      .on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      })
      .connect({
        host: config.host,
        port: config.port ?? 22,
        username: config.username ?? "root",
        privateKey: config.privateKey,
        readyTimeout: 10_000,
      });
  });
}

/**
 * Upload a file via SFTP.
 */
export function sshUploadFile(
  config: SSHConfig,
  remotePath: string,
  content: string,
  mode?: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn
      .on("ready", () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          const stream = sftp.createWriteStream(remotePath, {
            mode: mode ?? 0o644,
          });

          stream.on("close", () => {
            conn.end();
            resolve();
          });
          stream.on("error", (writeErr: Error) => {
            conn.end();
            reject(writeErr);
          });

          stream.end(content);
        });
      })
      .on("error", (err) => {
        reject(err);
      })
      .connect({
        host: config.host,
        port: config.port ?? 22,
        username: config.username ?? "root",
        privateKey: config.privateKey,
        readyTimeout: 10_000,
      });
  });
}

/**
 * Handle returned by sshExecStream to manage a long-running SSH command.
 */
export interface StreamHandle {
  /** The SSH client — call `.end()` to terminate the stream. */
  client: Client;
  /** Resolves with exit code when the remote command finishes naturally. */
  done: Promise<number>;
}

/**
 * Execute a command over SSH and stream stdout chunks via callback.
 * The caller manages the lifecycle by calling `handle.client.end()`.
 */
export function sshExecStream(
  config: SSHConfig,
  command: string,
  onData: (chunk: string) => void,
  onStderr?: (chunk: string) => void,
): Promise<StreamHandle> {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          const done = new Promise<number>((resolveDone) => {
            stream.on("data", (data: Buffer) => {
              onData(data.toString());
            });
            stream.stderr.on("data", (data: Buffer) => {
              onStderr?.(data.toString());
            });
            stream.on("close", (code: number) => {
              conn.end();
              resolveDone(code ?? 0);
            });
          });

          resolve({ client: conn, done });
        });
      })
      .on("error", (err) => {
        reject(err);
      })
      .connect({
        host: config.host,
        port: config.port ?? 22,
        username: config.username ?? "root",
        privateKey: config.privateKey,
        readyTimeout: 10_000,
      });
  });
}

/**
 * Test if SSH connection is possible.
 */
export function sshTestConnection(config: SSHConfig, timeoutMs = 10_000): Promise<boolean> {
  return new Promise((resolve) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      conn.end();
      resolve(false);
    }, timeoutMs);

    conn
      .on("ready", () => {
        clearTimeout(timer);
        conn.end();
        resolve(true);
      })
      .on("error", () => {
        clearTimeout(timer);
        resolve(false);
      })
      .connect({
        host: config.host,
        port: config.port ?? 22,
        username: config.username ?? "root",
        privateKey: config.privateKey,
        readyTimeout: timeoutMs,
      });
  });
}
