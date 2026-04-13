/**
 * live-connection-registry.ts
 *
 * In-memory registry of active WebSocket connections from mc-bridge plugins.
 * Keyed by LiveGatewayConnection.id (not vmId — works for any machine type).
 *
 * globalThis singleton so the custom WS server (server.ts) and Next.js route
 * handlers share the same instance — same pattern as pubsub.
 */

import type { WebSocket } from "ws";
import type { MCToPlugin } from "@agentcenter/types";

export interface LiveConnection {
  connectionId: string;
  ws: WebSocket;
  connectedAt: Date;
  lastMessageAt: Date;
  pluginVersion: string;
}

export class LiveConnectionRegistry {
  private map = new Map<string, LiveConnection>();

  add(conn: LiveConnection): void {
    this.map.set(conn.connectionId, conn);
  }

  get(connectionId: string): LiveConnection | undefined {
    return this.map.get(connectionId);
  }

  remove(connectionId: string): void {
    this.map.delete(connectionId);
  }

  has(connectionId: string): boolean {
    return this.map.has(connectionId);
  }

  touch(connectionId: string): void {
    const conn = this.map.get(connectionId);
    if (conn) conn.lastMessageAt = new Date();
  }

  /** Send a message to a connection. Returns true if sent. */
  send(connectionId: string, msg: MCToPlugin): boolean {
    const conn = this.map.get(connectionId);
    if (!conn || conn.ws.readyState !== 1 /* OPEN */) return false;
    try {
      conn.ws.send(JSON.stringify(msg));
      return true;
    } catch (err) {
      console.error(`[live-registry] WS send failed for ${connectionId}:`, err);
      this.remove(connectionId);
      return false;
    }
  }

  /** Returns connectionIds that have not sent a message within ttlMs. */
  staleIds(ttlMs: number): string[] {
    const cutoff = Date.now() - ttlMs;
    const stale: string[] = [];
    for (const [id, conn] of this.map) {
      if (conn.lastMessageAt.getTime() < cutoff) stale.push(id);
    }
    return stale;
  }

  get size(): number {
    return this.map.size;
  }

  allConnectionIds(): string[] {
    return Array.from(this.map.keys());
  }
}

// ── globalThis singleton ──────────────────────────────────────────────────────

const g = globalThis as unknown as { __mc_live_registry?: LiveConnectionRegistry };
export const connectionRegistry =
  g.__mc_live_registry ?? (g.__mc_live_registry = new LiveConnectionRegistry());
