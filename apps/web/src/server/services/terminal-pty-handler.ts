/**
 * Tier D (Slice 6): browser Cloud-Shell PTY relay. Bridges a browser WebSocket to an interactive SSH
 * shell — the byte-stream half the terminal-session lifecycle deferred (spec D2).
 *
 * Auth is the one-time `ts_` connect token minted by openTerminalSession: the WS carries `?id=&token=`,
 * we activate the session by token alone (no cookie/tenancy needed), resolve SSH credentials, and pipe
 * bytes both ways. Wired into apps/web/server.ts exactly where the live-gateway upgrade lives,
 * TERMINALS-gated. The live relay needs a real SSH target (flagged infra); the token/lifecycle/
 * credential-resolution logic is unit-tested.
 */
import type { WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import { parse } from "node:url";
import {
  activateTerminalByConnectToken,
  resolveTerminalSshConfig,
  closeTerminalSession,
} from "./terminals";
import { sshShell } from "./ssh";

const OPEN = 1; // ws.OPEN

function sendError(ws: WebSocket, message: string): void {
  try {
    if (ws.readyState === OPEN) ws.send(JSON.stringify({ type: "error", message }));
  } catch {
    /* ignore */
  }
}

export async function handleTerminalConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  let closed = false;
  try {
    const { query } = parse(req.url || "", true);
    const id = typeof query.id === "string" ? query.id : "";
    const token = typeof query.token === "string" ? query.token : "";
    if (!id || !token) {
      sendError(ws, "id and token are required");
      ws.close(4001, "missing id/token");
      return;
    }

    // Authenticate + activate purely by the one-time token.
    const session = await activateTerminalByConnectToken(id, token);

    const config = await resolveTerminalSshConfig(session);
    if (!config) {
      sendError(ws, "No SSH credentials available for this target on this instance");
      ws.close(4003, "no credentials");
      await closeTerminalSession(session.workspaceId, session.id).catch(() => {});
      return;
    }

    const { client, stream } = await sshShell(config);

    const teardown = async () => {
      if (closed) return;
      closed = true;
      try {
        client.end();
      } catch {
        /* ignore */
      }
      await closeTerminalSession(session.workspaceId, session.id).catch(() => {});
    };

    // SSH → browser (raw bytes).
    stream.on("data", (d: Buffer) => {
      if (ws.readyState === OPEN) ws.send(d);
    });
    stream.stderr?.on("data", (d: Buffer) => {
      if (ws.readyState === OPEN) ws.send(d);
    });
    stream.on("close", () => {
      if (ws.readyState === OPEN) ws.close(1000, "shell closed");
      void teardown();
    });

    // browser → SSH (keystrokes / resize control frames).
    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (!isBinary) {
        // Control frames are JSON, e.g. {"type":"resize","cols":120,"rows":40}.
        try {
          const msg = JSON.parse(data.toString());
          if (msg?.type === "resize" && stream.setWindow) {
            stream.setWindow(msg.rows ?? 24, msg.cols ?? 80, 0, 0);
            return;
          }
        } catch {
          /* not a control frame — fall through and treat as input */
        }
      }
      stream.write(data);
    });
    ws.on("close", () => void teardown());
    ws.on("error", () => void teardown());
  } catch (err) {
    sendError(ws, err instanceof Error ? err.message : String(err));
    if (!closed) ws.close(4000, "error");
  }
}
