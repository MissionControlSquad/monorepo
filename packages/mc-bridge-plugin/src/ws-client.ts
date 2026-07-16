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
import * as nodeFs from "node:fs";
import { DeliveryDedup, shouldForceReconnect } from "./delivery-dedup";
import type {
  PluginToMC,
  MCToPlugin,
  MsgDeliverTask,
  MsgNotify,
  MsgSessionDone,
  MsgTaskDone,
} from "@agentcenter/types";
import { LIVE_GATEWAY } from "@agentcenter/types";
import type { MCBridgeConfig } from "./config-schema";
import { deriveMachineFingerprint, deliverToLocalAgent, listLocalAgents } from "./openclaw-local";
import { PLUGIN_VERSION } from "./version";
import { PendingTaskDone } from "./pending-task-done";

type SendHandler = (msg: PluginToMC) => void;

/** Pending notification held while the agent's session is active. */
interface PendingNotify {
  agentSlug: string;
  content: string;
}

export class MCBridgeWsClient {
  private ws: WebSocket | null = null;
  private reconnectMs: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private fingerprint = "";
  private connectionId = "";
  private connectionToken = ""; // Updated after first mc.welcome (per-machine token, persisted in config)
  private dedup: DeliveryDedup; // Dedup buffer (capped; optionally persisted across restarts)
  private pongPending = false; // a ping was sent and its pong not yet received
  private missedPongs = 0; // consecutive unanswered pings
  private pendingTaskDone = new PendingTaskDone(); // task_done frames awaiting mc.task_done_ack
  private onConnectCallbacks: Array<() => void> = [];
  /** Tracks which agents currently have a running runEmbeddedAgent session. */
  private activeSessions = new Set<string>();
  /** Pending notifications buffered while the agent is busy. One per agent (latest wins). */
  private pendingNotify = new Map<string, PendingNotify>();

  constructor(private config: MCBridgeConfig, private api: any) {
    this.reconnectMs = config.reconnectBaseMs ?? 2_000;
    this.connectionToken = config.token;
    this.dedup = new DeliveryDedup(
      LIVE_GATEWAY.PLUGIN_DEDUP_LIMIT,
      config.dedupStatePath,
      config.dedupStatePath ? nodeFs : undefined,
    );
  }

  /** Force-reconnect after this many consecutive unanswered pings (half-open socket detection). */
  private static readonly MAX_MISSED_PONGS = 2;

  onConnect(cb: () => void): void {
    this.onConnectCallbacks.push(cb);
  }

  send(msg: PluginToMC): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Send a task completion reliably: buffer it until MC acks (mc.task_done_ack), so a frame dropped
   * on a half-open socket is resent on the next reconnect / ping tick instead of lost.
   */
  sendTaskDone(frame: MsgTaskDone): void {
    this.pendingTaskDone.add(frame, Date.now());
    this.send(frame);
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
      this.ws = new WebSocket(this.config.agentCenterUrl);
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
    const agents = await listLocalAgents(this.api).catch(() => []);
    const agentSlugs = agents.map((a) => a.slug);

    const nonce = randomBytes(16).toString("hex");
    this.send({
      type: "vm.hello",
      token: this.connectionToken,
      fingerprint: this.fingerprint,
      nonce,
      timestamp: Date.now(),
      pluginVersion: PLUGIN_VERSION,
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
        // Reconnected: resend every task completion still awaiting an ack.
        this.resendPendingTaskDone();
        for (const cb of this.onConnectCallbacks) cb();
        break;

      case "mc.pong":
        // Keepalive acknowledged — the socket is alive.
        this.pongPending = false;
        this.missedPongs = 0;
        break;

      case "mc.task_done_ack":
        this.pendingTaskDone.ack(msg.slug, msg.taskId);
        break;

      case "mc.deliver_task":
        this.handleDeliverTask(msg).catch(console.error);
        break;

      case "mc.notify":
        this.handleNotify(msg);
        break;

      case "mc.error":
        console.error(`[agentcenter-bridge] MC error [${msg.code}]: ${msg.message}`);
        if (msg.code === "auth_failed" || msg.code === "token_revoked" || msg.code === "nonce_replay") {
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
    // Dedup (FIFO-capped, persisted across restarts when configured): run the session only once per
    // deliveryId. A re-delivery — even after a plugin restart — is acked again but not re-run.
    if (!this.dedup.has(msg.deliveryId)) {
      this.dedup.add(msg.deliveryId);
      this.runAgentSession(msg.agentSlug, msg.message, "task_delivery", msg.deliveryId);
    }

    // Always ack — MC marks as delivered on ack
    this.send({ type: "vm.task_ack", deliveryId: msg.deliveryId });
  }

  private handleNotify(msg: MsgNotify): void {
    // No ack needed — notifications are fire-and-forget.
    this.runAgentSession(msg.agentSlug, msg.content, msg.kind);
  }

  /**
   * Starts a runEmbeddedAgent session for an agent.
   * Enforces one active session per agent — concurrent calls are buffered
   * (latest wins) and flushed automatically when the session completes.
   * Sends vm.session_done on completion so MC can log the result.
   * Non-async: returns immediately, manages the session via promise chain.
   */
  private runAgentSession(
    agentSlug: string,
    content: string,
    trigger: MsgSessionDone["trigger"],
    deliveryId?: string,
  ): void {
    if (this.activeSessions.has(agentSlug)) {
      // Agent is mid-session — buffer so it's picked up immediately after
      this.pendingNotify.set(agentSlug, { agentSlug, content });
      console.log(`[agentcenter-bridge] @${agentSlug} is busy — buffered notification (${trigger}) for after session`);
      return;
    }
    this.activeSessions.add(agentSlug);
    const startedAt = Date.now();
    deliverToLocalAgent(this.api, agentSlug, content)
      .then(() => {
        const durationMs = Date.now() - startedAt;
        this.send({
          type: "vm.session_done",
          agentSlug,
          trigger,
          success: true,
          durationMs,
          ...(deliveryId ? { deliveryId } : {}),
        });
      })
      .catch((err: unknown) => {
        const durationMs = Date.now() - startedAt;
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[agentcenter-bridge] runAgentSession failed for @${agentSlug} (${trigger}):`, err);
        this.send({
          type: "vm.session_done",
          agentSlug,
          trigger,
          success: false,
          durationMs,
          errorMessage,
          ...(deliveryId ? { deliveryId } : {}),
        });
      })
      .finally(() => {
        this.activeSessions.delete(agentSlug);
        const pending = this.pendingNotify.get(agentSlug);
        if (pending) {
          this.pendingNotify.delete(agentSlug);
          console.log(`[agentcenter-bridge] flushing buffered notification for @${agentSlug}`);
          this.runAgentSession(agentSlug, pending.content, trigger);
        }
      });
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
    this.pongPending = false;
    this.missedPongs = 0;
    this.pingInterval = setInterval(() => {
      // If the previous ping was never answered, the socket may be half-open (no FIN/RST). Count
      // consecutive misses and force a reconnect before the server's slower activity eviction.
      if (this.pongPending) {
        this.missedPongs += 1;
        if (shouldForceReconnect(this.missedPongs, MCBridgeWsClient.MAX_MISSED_PONGS)) {
          console.warn(
            `[agentcenter-bridge] No pong after ${this.missedPongs} pings — connection stale, reconnecting.`,
          );
          this.ws?.terminate(); // fires 'close' → handleClose → scheduleReconnect
          return;
        }
      }
      this.send({ type: "vm.ping", timestamp: Date.now() });
      this.pongPending = true;
      // Also resend any task completion unacked for longer than one ping interval.
      this.resendPendingTaskDone(Date.now() - LIVE_GATEWAY.PLUGIN_PING_INTERVAL_MS);
    }, LIVE_GATEWAY.PLUGIN_PING_INTERVAL_MS);
  }

  /** Resend unacked task_done frames (all when staleBefore omitted; else only stale ones). */
  private resendPendingTaskDone(staleBefore?: number): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const due = this.pendingTaskDone.due(staleBefore);
    for (const frame of due) this.send(frame);
    this.pendingTaskDone.markResent(due, Date.now());
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
