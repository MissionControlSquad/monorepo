/**
 * live-gateway-handler.ts
 *
 * Handles all WebSocket messages from mc-bridge plugin connections.
 * Works for any machine type (self-hosted, user VPS, MC-provisioned CloudVM).
 *
 * Message flow:
 *   Plugin → MC: vm.hello → mc.welcome (then vm.ping / vm.agents_report / etc.)
 *   MC → Plugin: mc.deliver_task / mc.pong / mc.error
 */

import type { WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  listActiveLiveGatewayTokens,
  touchLiveGatewayToken,
  consumeNonce,
  findConnectionByFingerprint,
  createConnection,
  markConnectionConnected,
  markConnectionDisconnected,
  refreshConnectionToken,
  syncAgentRoutes,
  clearAgentRoutes,
  drainPendingDeliveries,
  markDeliveryReceived,
  findPendingDeliveryConnection,
  resolveAgentBySlugOrId,
  logAgentAction,
  updateAgent,
  isAgentAssignedToTask,
  updateTaskStatus,
  findTaskByIdSelect,
} from "@agentcenter/database";
import { connectionRegistry } from "./live-connection-registry";
import { pubsub, PubSubEvent } from "@agentcenter/graphql-server";
import type {
  PluginToMC,
  MCToPlugin,
  MsgHello,
  MsgAgentsReport,
  MsgAgentStatus,
  MsgAgentMessage,
  MsgTaskDone,
  MsgTaskAck,
  VMErrorCode,
} from "@agentcenter/types";
import { LIVE_GATEWAY } from "@agentcenter/types";
import { TaskStatus } from "../constants";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function send(ws: WebSocket, msg: MCToPlugin): void {
  if (ws.readyState === 1 /* OPEN */) ws.send(JSON.stringify(msg));
}

function sendError(ws: WebSocket, code: VMErrorCode, message: string): void {
  send(ws, { type: "mc.error", code, message });
}

/** Strip all HTML tags from a string (server-side, no DOM required). */
function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "").trim();
}

// ─── Install token lookup ─────────────────────────────────────────────────────

async function findValidInstallToken(rawToken: string) {
  const tokens = await listActiveLiveGatewayTokens();
  for (const t of tokens) {
    if (await bcrypt.compare(rawToken, t.tokenHash)) return t;
  }
  return null;
}

// ─── vm.hello handler ─────────────────────────────────────────────────────────

async function handleHello(ws: WebSocket, msg: MsgHello): Promise<string | null> {
  // 1. Clock-skew guard
  const delta = Math.abs(Date.now() - msg.timestamp);
  if (delta > LIVE_GATEWAY.MAX_CLOCK_SKEW_MS) {
    sendError(ws, "auth_failed", `Clock skew too large: ${delta}ms`);
    return null;
  }

  // 2. Nonce format + atomic consumption — prevents replay attacks
  if (!/^[0-9a-f]{32}$/i.test(msg.nonce)) {
    sendError(ws, "auth_failed", "Invalid nonce format");
    return null;
  }
  const nonceOk = await consumeNonce(msg.nonce);
  if (!nonceOk) {
    sendError(ws, "nonce_replay", "Nonce already used");
    return null;
  }

  // 3. Check if fingerprint already registered (reconnect path)
  const existing = await findConnectionByFingerprint(msg.fingerprint);

  if (existing) {
    const connectionId = existing.id;
    const hostMeta = msg.meta as unknown as Record<string, unknown>;

    // Fast path: valid per-machine permanent token
    const permTokenOk =
      existing.connectionToken && (await bcrypt.compare(msg.token, existing.connectionToken));

    if (permTokenOk) {
      await markConnectionConnected(connectionId, msg.pluginVersion, hostMeta);
      if (msg.agents?.length) await syncAgentRoutes(connectionId, msg.agents);
      send(ws, { type: "mc.welcome", vmId: connectionId });
      return connectionId;
    }

    // Fallback: machine restarted without persisting the permanent token.
    // Accept the install token and re-issue a fresh permanent token automatically.
    const installToken = await findValidInstallToken(msg.token);
    if (!installToken) {
      sendError(ws, "auth_failed", "Invalid connection token");
      return null;
    }

    const rawConnectionToken = randomBytes(32).toString("hex");
    const connectionTokenHash = await bcrypt.hash(rawConnectionToken, 12);
    await refreshConnectionToken(connectionId, connectionTokenHash);
    await markConnectionConnected(connectionId, msg.pluginVersion, hostMeta);
    if (msg.agents?.length) await syncAgentRoutes(connectionId, msg.agents);
    await touchLiveGatewayToken(installToken.id);

    // Send fresh permanent token — plugin stores it in memory for this session
    send(ws, { type: "mc.welcome", vmId: connectionId, vmToken: rawConnectionToken });
    return connectionId;
  }

  // 4. First connect: validate install token
  const installToken = await findValidInstallToken(msg.token);
  if (!installToken) {
    sendError(ws, "auth_failed", "Invalid install token");
    return null;
  }

  // 5. Create new connection record — machineFingerprint @unique ensures one record per machine
  const rawConnectionToken = randomBytes(32).toString("hex");
  const connectionTokenHash = await bcrypt.hash(rawConnectionToken, 12);

  const hostMeta = msg.meta as unknown as Record<string, unknown>;
  const safeHostMeta =
    JSON.stringify(hostMeta).length <= 4096
      ? hostMeta
      : { hostname: hostMeta.hostname, platform: hostMeta.platform, arch: hostMeta.arch };

  let connectionId: string;
  try {
    const conn = await createConnection({
      machineFingerprint: msg.fingerprint,
      connectionToken: connectionTokenHash,
      machineName: String(msg.meta.hostname).slice(0, 255),
      pluginVersion: msg.pluginVersion,
      hostMeta: safeHostMeta,
    });
    connectionId = conn.id;
  } catch (err: any) {
    if (err?.code === "P2002") {
      sendError(ws, "internal_error", "Fingerprint collision, please retry");
    } else {
      sendError(ws, "internal_error", "Registration failed");
    }
    return null;
  }

  // Sync reported agents
  if (msg.agents?.length) {
    await syncAgentRoutes(connectionId, msg.agents);
  }

  await touchLiveGatewayToken(installToken.id);

  // Send welcome with raw connectionToken (shown once — plugin must persist it)
  send(ws, { type: "mc.welcome", vmId: connectionId, vmToken: rawConnectionToken });
  return connectionId;
}

// ─── vm.agents_report handler ─────────────────────────────────────────────────

async function handleAgentsReport(connectionId: string, msg: MsgAgentsReport): Promise<void> {
  await syncAgentRoutes(
    connectionId,
    msg.agents.map((a) => a.slug),
  );

  for (const info of msg.agents) {
    const agent = await resolveAgentBySlugOrId(info.slug, info.agentId);
    if (!agent) continue;
    await updateAgent(agent.id, {
      status: info.status,
      detailedStatus: info.detailedStatus ?? null,
      statusMessage: info.statusMessage ?? null,
      currentTaskId: info.currentTaskId ?? null,
    }).catch((err) =>
      console.error(`[live-gateway] Failed to update agent status for ${info.slug}:`, err),
    );
    pubsub.publish(PubSubEvent.AGENT.STATUS_CHANGED, { agentId: agent.id });
  }
}

// ─── vm.agent_status handler ──────────────────────────────────────────────────

async function handleAgentStatus(_connectionId: string, msg: MsgAgentStatus): Promise<void> {
  const agent = await resolveAgentBySlugOrId(msg.slug, msg.agentId);
  if (!agent) return;
  await updateAgent(agent.id, {
    status: msg.status,
    detailedStatus: msg.detailedStatus ?? null,
    statusMessage: msg.statusMessage ?? null,
    currentTaskId: msg.currentTaskId ?? null,
  }).catch((err) =>
    console.error(`[live-gateway] Failed to update agent status for ${msg.slug}:`, err),
  );
  pubsub.publish(PubSubEvent.AGENT.STATUS_CHANGED, { agentId: agent.id });
}

// ─── vm.agent_message handler ─────────────────────────────────────────────────

async function handleAgentMessage(_connectionId: string, msg: MsgAgentMessage): Promise<void> {
  const clean = stripHtml(msg.content);
  if (!clean) return;

  if (msg.taskId) {
    const agent = await resolveAgentBySlugOrId(msg.slug);
    if (agent) {
      const action = await logAgentAction({
        agentId: agent.id,
        taskId: msg.taskId,
        actionType: "status_update",
        description: clean,
        metadata: { source: "live_gateway", timestamp: msg.timestamp },
      });
      if (action) {
        pubsub.publish(PubSubEvent.AGENT.ACTION_LOGGED, {
          agentId: agent.id,
          actionId: action.id,
        });
      }
    }
  }
}

// ─── vm.task_done handler ─────────────────────────────────────────────────────

async function handleTaskDone(connectionId: string, msg: MsgTaskDone): Promise<void> {
  // Security: verify the reporting agent is actually assigned to the task.
  // A malicious or misconfigured plugin cannot mark arbitrary tasks as done.
  const agent = await resolveAgentBySlugOrId(msg.slug);
  if (!agent) {
    console.warn(
      `[live-gateway] vm.task_done: unknown agent slug "${msg.slug}" from connection ${connectionId} — rejected`,
    );
    return;
  }

  const isAssigned = await isAgentAssignedToTask(msg.taskId, agent.id);
  if (!isAssigned) {
    console.warn(
      `[live-gateway] vm.task_done: agent "${msg.slug}" is not assigned to task ${msg.taskId} — rejected`,
    );
    return;
  }

  // Fetch the task to get current status (needed for fromStatus in the event).
  const task = await findTaskByIdSelect(msg.taskId, {
    id: true,
    taskNumber: true,
    title: true,
    status: true,
    projectId: true,
  });
  if (!task) return;

  if (task.status === TaskStatus.DONE) return; // already done — idempotent

  await updateTaskStatus(msg.taskId, TaskStatus.DONE);

  pubsub.publish(PubSubEvent.TASK.UPDATED, { taskId: msg.taskId });

  // Emit TASK_STATUS_CHANGED so task subscribers get notified and live delivery
  // fires (tryDeliverTaskDoneNotification in notification.ts handles this event).
  const { taskModel } = await import("../models/task");
  await taskModel
    .emitStatusChanged(task, {
      fromStatus: task.status,
      toStatus: TaskStatus.DONE,
      changedBy: agent.id,
    })
    .catch((err) =>
      console.error(`[live-gateway] emitStatusChanged failed for task ${msg.taskId}:`, err),
    );
}

// ─── vm.task_ack handler ──────────────────────────────────────────────────────

async function handleTaskAck(connectionId: string, msg: MsgTaskAck): Promise<void> {
  // Security: only the connection that owns the delivery may ack it.
  // Prevents a malicious plugin from clearing another agent's pending delivery.
  const delivery = await findPendingDeliveryConnection(msg.deliveryId);

  if (!delivery) return; // already received or expired — no-op

  if (delivery.connectionId !== connectionId) {
    console.warn(
      `[live-gateway] vm.task_ack: connection ${connectionId} attempted to ack delivery ${msg.deliveryId} owned by ${delivery.connectionId} — rejected`,
    );
    return;
  }

  await markDeliveryReceived(msg.deliveryId);
}

// ─── Pending task drain ───────────────────────────────────────────────────────

async function drainAndDeliver(connectionId: string, ws: WebSocket): Promise<void> {
  const pending = await drainPendingDeliveries(connectionId);
  for (const task of pending) {
    send(ws, {
      type: "mc.deliver_task",
      deliveryId: task.id,
      agentSlug: task.agentSlug,
      taskId: task.taskId,
      message: task.message,
      priority: task.priority as any,
    });
  }
}

// ─── Connection entry point ───────────────────────────────────────────────────

export function handlePluginConnection(ws: WebSocket, _req: IncomingMessage): void {
  let connectionId: string | null = null;
  let helloReceived = false;

  // Enforce hello timeout — close if no hello within 10s
  const helloTimer = setTimeout(() => {
    if (!helloReceived) ws.terminate();
  }, LIVE_GATEWAY.HELLO_TIMEOUT_MS);

  ws.on("message", async (raw) => {
    let msg: PluginToMC;
    try {
      msg = JSON.parse(raw.toString()) as PluginToMC;
    } catch {
      return; // ignore unparseable frames
    }

    if (connectionId) connectionRegistry.touch(connectionId);

    try {
      switch (msg.type) {
        case "vm.hello": {
          if (helloReceived) return;
          helloReceived = true;
          clearTimeout(helloTimer);

          const resolvedId = await handleHello(ws, msg);
          if (!resolvedId) {
            ws.terminate();
            return;
          }

          connectionId = resolvedId;
          connectionRegistry.add({
            connectionId,
            ws,
            connectedAt: new Date(),
            lastMessageAt: new Date(),
            pluginVersion: msg.pluginVersion,
          });

          // Drain queued tasks immediately
          await drainAndDeliver(connectionId, ws);
          break;
        }

        case "vm.ping": {
          if (!connectionId) return;
          send(ws, { type: "mc.pong", timestamp: Date.now() });
          break;
        }

        case "vm.agents_report": {
          if (!connectionId) return;
          await handleAgentsReport(connectionId, msg);
          break;
        }

        case "vm.agent_status": {
          if (!connectionId) return;
          await handleAgentStatus(connectionId, msg);
          break;
        }

        case "vm.agent_message": {
          if (!connectionId) return;
          await handleAgentMessage(connectionId, msg);
          break;
        }

        case "vm.task_done": {
          if (!connectionId) return;
          await handleTaskDone(connectionId, msg);
          break;
        }

        case "vm.task_ack": {
          if (!connectionId) return;
          await handleTaskAck(connectionId, msg);
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error("[live-gateway] Unhandled error in message handler:", err);
    }
  });

  ws.on("close", async () => {
    clearTimeout(helloTimer);
    if (connectionId) {
      connectionRegistry.remove(connectionId);
      await markConnectionDisconnected(connectionId).catch(() => undefined);
      await clearAgentRoutes(connectionId).catch(() => undefined);
    }
  });

  ws.on("error", (err) => {
    console.error("[live-gateway] WS error:", err.message);
  });
}

// ─── Zombie connection eviction ───────────────────────────────────────────────

let evictionInterval: ReturnType<typeof setInterval> | null = null;

export function startEvictionLoop(): void {
  if (evictionInterval) return;
  evictionInterval = setInterval(async () => {
    const stale = connectionRegistry.staleIds(LIVE_GATEWAY.MC_EVICT_TIMEOUT_MS);
    for (const id of stale) {
      const conn = connectionRegistry.get(id);
      if (conn) {
        console.warn(`[live-gateway] Evicting stale connection: ${id}`);
        conn.ws.terminate(); // triggers "close" which handles cleanup
      }
    }
  }, LIVE_GATEWAY.EVICTION_CHECK_MS);
}
