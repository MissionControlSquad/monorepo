/**
 * VMLiveRegistry — in-memory map of active plugin WebSocket connections.
 *
 * Stored on globalThis so the custom WS server and Next.js route handlers
 * share the same registry across hot-reloads in dev (same pattern as pubsub).
 */

import type { WebSocket } from "ws";

export interface VMConnection {
  vmId: string;
  ws: WebSocket;
  connectedAt: Date;
  lastMessageAt: Date;
  pluginVersion: string;
}

class VMLiveRegistry {
  private connections = new Map<string, VMConnection>();

  add(conn: VMConnection): void {
    this.connections.set(conn.vmId, conn);
  }

  get(vmId: string): VMConnection | undefined {
    return this.connections.get(vmId);
  }

  remove(vmId: string): void {
    this.connections.delete(vmId);
  }

  has(vmId: string): boolean {
    return this.connections.has(vmId);
  }

  touch(vmId: string): void {
    const conn = this.connections.get(vmId);
    if (conn) conn.lastMessageAt = new Date();
  }

  send(vmId: string, msg: object): boolean {
    const conn = this.connections.get(vmId);
    if (!conn || conn.ws.readyState !== 1 /* OPEN */) return false;
    conn.ws.send(JSON.stringify(msg));
    return true;
  }

  /** Return vmIds of connections silent for longer than `thresholdMs`. */
  staleIds(thresholdMs: number): string[] {
    const cutoff = Date.now() - thresholdMs;
    const stale: string[] = [];
    for (const [vmId, conn] of this.connections) {
      if (conn.lastMessageAt.getTime() < cutoff) stale.push(vmId);
    }
    return stale;
  }

  size(): number {
    return this.connections.size;
  }

  allVmIds(): string[] {
    return Array.from(this.connections.keys());
  }
}

const globalForRegistry = globalThis as unknown as {
  __agentcenter_vm_registry?: VMLiveRegistry;
};

export const vmLiveRegistry: VMLiveRegistry =
  globalForRegistry.__agentcenter_vm_registry ??
  (globalForRegistry.__agentcenter_vm_registry = new VMLiveRegistry());
