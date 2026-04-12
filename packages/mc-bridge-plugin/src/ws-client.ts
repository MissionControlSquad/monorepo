/**
 * ws-client.ts
 *
 * Persistent WebSocket client that connects to AgentCenter Cloud's live gateway.
 * Handles authentication (vm.hello), reconnect with exponential backoff,
 * ping/pong keepalive, task delivery, and deduplication.
 */

import { WebSocket } from "ws";
import { randomBytes, createHash } from "node:crypto";
import os from "node:os";
import type {
  PluginToMC,
  MCToPlugin,
  MsgDeliverTask,
  MsgNotify,
} from "@agentcenter/types";
import { LIVE_GATEWAY } from "@agentcenter/types";
import type { MCBridgeConfig } from "./config-schema";
import { deriveMachineFingerprint, deliverToLocalAgent, listLocalAgents } from "./openclaw-local";

type SendHandler = (msg: PluginToMC) => void;

export class MCBridgeWsClient {
  private ws: WebSocket | null = null;
  private reconnectMs: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private fingerprint = "";
  private connectionId = "";
  private connectionToken = ""; // Updated after first mc.welcome (per-machine token, persisted in config)
  private deliveredIds = new Set<string>(); // Dedup buffer (capped at PLUGIN_DEDUP_LIMIT)
  private onConnectCallbacks: Array<() => void> = [];

  constructor(private config: MCBridgeConfig) {
    this.reconnectMs = config.reconnectBaseMs ?? 2_000;
    this.connectionToken = config.token;
  }

  onConnect(cb: () => void): void {
    this.onConnectCallbacks.push(cb);
  }

  send(msg: PluginToMC): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  async start(): Promise<void> {
    this.running = true;
    this.fingerprint = this.config.fingerprint || (await deriveMachineFingerprint());
    this.connect();
  }

  stop(): void {
    this.running = false;
    this.clearTimers();
    this.ws?.terminate();
    this.ws = null;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private connect(): void {
    if (!this.running) return;

    try {
      this.ws = new WebSocket(this.config.mcUrl);
    } catch (err) {
      console.error("[agentcenter-bridge] Failed to create WebSocket:", err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => this.handleOpen().catch(console.error));
    this.ws.on("message", (raw) => this.handleMessage(raw.toString()));
    this.ws.on("close", () => this.handleClose());
    this.ws.on("error", (err) => console.error("[agentcenter-bridge] WS error:", err.message));
  }

  private async handleOpen(): Promise<void> {
    // Reset backoff on successful open
    this.reconnectMs = this.config.reconnectBaseMs ?? 2_000;

    // Gather agent slugs to register routes on MC side
    const agents = await listLocalAgents().catch(() => []);
    const agentSlugs = agents.map((a) => a.slug);

    const nonce = randomBytes(16).toString("hex");
    this.send({
      type: "vm.hello",
      token: this.connectionToken,
      fingerprint: this.fingerprint,
      nonce,
      timestamp: Date.now(),
      pluginVersion: "0.1.0",
      meta: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
      },
      agents: agentSlugs,
    });
  }

  private handleMessage(raw: string): void {
    let msg: MCToPlugin;
    try {
      msg = JSON.parse(raw) as MCToPlugin;
    } catch {
      return;
    }

    switch (msg.type) {
      case "mc.welcome":
        this.connectionId = msg.vmId; // vmId field carries connectionId
        if (msg.vmToken) {
          // First-time registration: persist new per-machine connectionToken
          this.connectionToken = msg.vmToken;
          console.log(
            "[agentcenter-bridge] Registered with AgentCenter Cloud.",
            "\n  connectionId:", this.connectionId,
            "\n  connectionToken (save to config as 'token'):", msg.vmToken,
          );
        }
        this.startPing();
        for (const cb of this.onConnectCallbacks) cb();
        break;

      case "mc.pong":
        // Keepalive acknowledged — nothing to do
        break;

      case "mc.deliver_task":
        this.handleDeliverTask(msg).catch(console.error);
        break;

      case "mc.notify":
        this.handleNotify(msg).catch(console.error);
        break;

      case "mc.error":
        console.error(`[agentcenter-bridge] MC error [${msg.code}]: ${msg.message}`);
        if (msg.code === "auth_failed" || msg.code === "token_revoked") {
          console.error("[agentcenter-bridge] Fatal auth error — stopping reconnect. Check your token.");
          this.running = false;
        }
        break;

      default:
        // Forward-compatible: unknown messages ignored
        break;
    }
  }

  private async handleDeliverTask(msg: MsgDeliverTask): Promise<void> {
    // Dedup: if already delivered this deliveryId, just ack again
    if (!this.deliveredIds.has(msg.deliveryId)) {
      if (this.deliveredIds.size >= LIVE_GATEWAY.PLUGIN_DEDUP_LIMIT) {
        // Evict oldest entry (Set preserves insertion order)
        const oldest = this.deliveredIds.values().next().value;
        if (oldest) this.deliveredIds.delete(oldest);
      }
      this.deliveredIds.add(msg.deliveryId);

      try {
        await deliverToLocalAgent(msg.agentSlug, msg.message);
      } catch (err) {
        console.error(`[agentcenter-bridge] Failed to deliver task to agent ${msg.agentSlug}:`, err);
      }
    }

    // Always ack — MC marks as delivered on ack
    this.send({ type: "vm.task_ack", deliveryId: msg.deliveryId });
  }

  private async handleNotify(msg: MsgNotify): Promise<void> {
    // No ack needed — notifications are fire-and-forget.
    // Trigger the agent's work cycle with the notification content.
    await deliverToLocalAgent(msg.agentSlug, msg.content);
  }

  private handleClose(): void {
    this.clearTimers();
    this.ws = null;
    if (this.running) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const delay = this.reconnectMs;
    this.reconnectMs = Math.min(
      this.reconnectMs * 2,
      this.config.reconnectMaxMs ?? 30_000,
    );
    console.log(`[agentcenter-bridge] Reconnecting in ${delay}ms…`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send({ type: "vm.ping", timestamp: Date.now() });
    }, LIVE_GATEWAY.PLUGIN_PING_INTERVAL_MS);
  }

  private clearTimers(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
