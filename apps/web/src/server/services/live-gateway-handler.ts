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
  findCloudVMIdByServerName,
  logCloudVMEvent,
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
  MsgSessionDone,
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

// ─── VM event logging ─────────────────────────────────────────────────────────

/**
 * Silently log an event to the CloudVM logs if the machineName maps to a
 * managed CloudVM. No-ops for self-hosted / user VPS machines.
 */
async function logVMActivity(
  machineName: string | null | undefined,
  message: string,
  level: "info" | "warn" | "error" = "info",
): Promise<void> {
  if (!machineName) return;
  try {
    const vmId = await findCloudVMIdByServerName(machineName);
    if (vmId) await logCloudVMEvent(vmId, message, level);
  } catch {
    // Never throw — logging is best-effort
  }
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
  const hostname = String(msg.meta?.hostname ?? "unknown").slice(0, 255);
  // 1. Clock-skew guard
  const delta = Math.abs(Date.now() - msg.timestamp);
  if (delta > LIVE_GATEWAY.MAX_CLOCK_SKEW_MS) {
    sendError(ws, "auth_failed", `Clock skew too large: ${delta}ms`);
    logVMActivity(
      hostname,
      `Auth rejected: clock skew ${delta}ms (limit ${LIVE_GATEWAY.MAX_CLOCK_SKEW_MS}ms) from ${hostname}`,
      "warn",
    ).catch(() => undefined);
    return null;
  }

  // 2. Nonce format + atomic consumption — prevents replay attacks
  if (!/^[0-9a-f]{32}$/i.test(msg.nonce)) {
    sendError(ws, "auth_failed", "Invalid nonce format");
    logVMActivity(hostname, `Auth rejected: invalid nonce format from ${hostname}`, "warn").catch(
      () => undefined,
    );
    return null;
  }
  const nonceOk = await consumeNonce(msg.nonce);
  if (!nonceOk) {
    sendError(ws, "nonce_replay", "Nonce already used");
    logVMActivity(
      hostname,
      `Auth rejected: nonce replay attempt from ${hostname} — possible duplicate connection`,
      "warn",
    ).catch(() => undefined);
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
      logVMActivity(
        hostname,
        `Plugin reconnected (permanent token) — v${msg.pluginVersion ?? "unknown"}, ${msg.agents?.length ?? 0} agent(s): ${(msg.agents ?? []).join(", ") || "none"}`,
      ).catch(() => undefined);
      return connectionId;
    }

    // Fallback: machine restarted without persisting the permanent token.
    // Accept the install token and re-issue a fresh permanent token automatically.
    const installToken = await findValidInstallToken(msg.token);
    if (!installToken) {
      sendError(ws, "auth_failed", "Invalid connection token");
      logVMActivity(
        hostname,
        `Auth rejected: invalid connection token from ${hostname} (fingerprint known, token mismatch)`,
        "warn",
      ).catch(() => undefined);
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
    logVMActivity(
      hostname,
      `Plugin reconnected — new permanent token issued (machine restarted without persisting token), ${msg.agents?.length ?? 0} agent(s)`,
    ).catch(() => undefined);
    return connectionId;
  }

  // 4. First connect: validate install token
  const installToken = await findValidInstallToken(msg.token);
  if (!installToken) {
    sendError(ws, "auth_failed", "Invalid install token");
    logVMActivity(
      hostname,
      `Auth rejected: invalid install token from ${hostname} — check token configuration`,
      "warn",
    ).catch(() => undefined);
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
      logVMActivity(
        hostname,
        `Registration failed: fingerprint collision for ${hostname} — please retry`,
        "error",
      ).catch(() => undefined);
    } else {
      sendError(ws, "internal_error", "Registration failed");
      logVMActivity(
        hostname,
        `Registration failed for ${hostname}: ${err?.message ?? "unknown error"}`,
        "error",
      ).catch(() => undefined);
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
  logVMActivity(
    hostname,
    `New machine registered — v${msg.pluginVersion ?? "unknown"}, ${msg.agents?.length ?? 0} agent(s): ${(msg.agents ?? []).join(", ") || "none"}`,
  ).catch(() => undefined);
  return connectionId;
}

// ─── vm.agents_report handler ─────────────────────────────────────────────────

async function handleAgentsReport(
  connectionId: string,
  msg: MsgAgentsReport,
  machineName: string | null,
): Promise<void> {
  await syncAgentRoutes(
    connectionId,
    msg.agents.map((a) => a.slug),
  );

  const slugs: string[] = [];
  for (const info of msg.agents) {
    const agent = await resolveAgentBySlugOrId(info.slug, info.agentId);
    if (!agent) {
      logVMActivity(
        machineName,
        `Agent report: unknown slug "@${info.slug}" — not registered in DB`,
        "warn",
      ).catch(() => undefined);
      continue;
    }
    await updateAgent(agent.id, {
      status: info.status,
      detailedStatus: info.detailedStatus ?? null,
      statusMessage: info.statusMessage ?? null,
      currentTaskId: info.currentTaskId ?? null,
    }).catch((err) =>
      console.error(`[live-gateway] Failed to update agent status for ${info.slug}:`, err),
    );
    pubsub.publish(PubSubEvent.AGENT.STATUS_CHANGED, { agentId: agent.id });
    slugs.push(`@${info.slug}(${info.status})`);
  }

  if (slugs.length > 0) {
    logVMActivity(machineName, `Agent report: ${slugs.join(", ")}`).catch(() => undefined);
  }
}

// ─── vm.agent_status handler ──────────────────────────────────────────────────

async function handleAgentStatus(
  _connectionId: string,
  msg: MsgAgentStatus,
  machineName: string | null,
): Promise<void> {
  const agent = await resolveAgentBySlugOrId(msg.slug, msg.agentId);
  if (!agent) {
    logVMActivity(machineName, `Agent status: unknown slug "@${msg.slug}"`, "warn").catch(
      () => undefined,
    );
    return;
  }
  await updateAgent(agent.id, {
    status: msg.status,
    detailedStatus: msg.detailedStatus ?? null,
    statusMessage: msg.statusMessage ?? null,
    currentTaskId: msg.currentTaskId ?? null,
  }).catch((err) =>
    console.error(`[live-gateway] Failed to update agent status for ${msg.slug}:`, err),
  );
  pubsub.publish(PubSubEvent.AGENT.STATUS_CHANGED, { agentId: agent.id });

  const detail = msg.detailedStatus ? ` (${msg.detailedStatus})` : "";
  const task = msg.currentTaskId ? ` on task ${msg.currentTaskId}` : "";
  logVMActivity(machineName, `@${msg.slug} → ${msg.status}${detail}${task}`).catch(() => undefined);
}

// ─── vm.agent_message handler ─────────────────────────────────────────────────

async function handleAgentMessage(
  _connectionId: string,
  msg: MsgAgentMessage,
  machineName: string | null,
): Promise<void> {
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
        logVMActivity(machineName, `@${msg.slug} posted message on task ${msg.taskId}`).catch(
          () => undefined,
        );
      }
    } else {
      logVMActivity(
        machineName,
        `Agent message: unknown slug "@${msg.slug}" for task ${msg.taskId}`,
        "warn",
      ).catch(() => undefined);
    }
  }
}

// ─── vm.task_done handler ─────────────────────────────────────────────────────

async function handleTaskDone(
  connectionId: string,
  msg: MsgTaskDone,
  machineName: string | null,
): Promise<void> {
  // Security: verify the reporting agent is actually assigned to the task.
  // A malicious or misconfigured plugin cannot mark arbitrary tasks as done.
  const agent = await resolveAgentBySlugOrId(msg.slug);
  if (!agent) {
    const warn = `vm.task_done: unknown agent slug "@${msg.slug}" from connection ${connectionId} — rejected`;
    console.warn(`[live-gateway] ${warn}`);
    logVMActivity(machineName, warn, "warn").catch(() => undefined);
    return;
  }

  const isAssigned = await isAgentAssignedToTask(msg.taskId, agent.id);
  if (!isAssigned) {
    const warn = `vm.task_done: @${msg.slug} is not assigned to task ${msg.taskId} — rejected`;
    console.warn(`[live-gateway] ${warn}`);
    logVMActivity(machineName, warn, "warn").catch(() => undefined);
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
  if (!task) {
    logVMActivity(
      machineName,
      `vm.task_done: task ${msg.taskId} not found — @${msg.slug}`,
      "warn",
    ).catch(() => undefined);
    return;
  }

  if (task.status === TaskStatus.DONE) {
    logVMActivity(
      machineName,
      `@${msg.slug} reported task #${task.taskNumber} done (already done — idempotent)`,
    ).catch(() => undefined);
    return;
  }

  await updateTaskStatus(msg.taskId, TaskStatus.DONE);
  logVMActivity(machineName, `@${msg.slug} completed task #${task.taskNumber}`).catch(
    () => undefined,
  );

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

async function handleTaskAck(
  connectionId: string,
  msg: MsgTaskAck,
  machineName: string | null,
): Promise<void> {
  // Security: only the connection that owns the delivery may ack it.
  // Prevents a malicious plugin from clearing another agent's pending delivery.
  const delivery = await findPendingDeliveryConnection(msg.deliveryId);

  if (!delivery) {
    logVMActivity(
      machineName,
      `Task ack: delivery ${msg.deliveryId} not found (already received or expired)`,
    ).catch(() => undefined);
    return;
  }

  if (delivery.connectionId !== connectionId) {
    const warn = `vm.task_ack: connection ${connectionId} attempted to ack delivery ${msg.deliveryId} owned by ${delivery.connectionId} — rejected`;
    console.warn(`[live-gateway] ${warn}`);
    logVMActivity(machineName, warn, "warn").catch(() => undefined);
    return;
  }

  await markDeliveryReceived(msg.deliveryId);
  logVMActivity(machineName, `Task delivery ${msg.deliveryId} acknowledged by plugin`).catch(
    () => undefined,
  );
}

// ─── vm.session_done handler ─────────────────────────────────────────────────

function handleSessionDone(msg: MsgSessionDone, machineName: string | null): void {
  const duration =
    msg.durationMs < 1_000 ? `${msg.durationMs}ms` : `${(msg.durationMs / 1_000).toFixed(1)}s`;

  if (msg.success) {
    logVMActivity(
      machineName,
      `@${msg.agentSlug} handled ${msg.trigger} — completed in ${duration}`,
      "info",
    ).catch(() => undefined);
  } else {
    logVMActivity(
      machineName,
      `@${msg.agentSlug} failed ${msg.trigger} after ${duration}${msg.errorMessage ? `: ${msg.errorMessage}` : ""}`,
      "error",
    ).catch(() => undefined);
  }
}

// ─── Pending task drain ───────────────────────────────────────────────────────

async function drainAndDeliver(
  connectionId: string,
  ws: WebSocket,
  machineName: string | null = null,
): Promise<void> {
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
    logVMActivity(
      machineName,
      `Task delivered to agent @${task.agentSlug} (task: ${task.taskId})`,
    ).catch(() => undefined);
  }
}

// ─── Connection entry point ───────────────────────────────────────────────────

export function handlePluginConnection(ws: WebSocket, _req: IncomingMessage): void {
  let connectionId: string | null = null;
  let helloReceived = false;
  let machineName: string | null = null;

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
          machineName = String(msg.meta?.hostname ?? "").slice(0, 255) || null;
          connectionRegistry.add({
            connectionId,
            ws,
            connectedAt: new Date(),
            lastMessageAt: new Date(),
            pluginVersion: msg.pluginVersion,
          });

          // Log plugin connect to VM activity log
          logVMActivity(
            machineName,
            `Plugin connected — v${msg.pluginVersion ?? "unknown"} (${machineName ?? "unknown host"})`,
          ).catch(() => undefined);

          // Drain queued tasks immediately
          await drainAndDeliver(connectionId, ws, machineName);
          break;
        }

        case "vm.ping": {
          if (!connectionId) return;
          send(ws, { type: "mc.pong", timestamp: Date.now() });
          break;
        }

        case "vm.agents_report": {
          if (!connectionId) return;
          await handleAgentsReport(connectionId, msg, machineName);
          break;
        }

        case "vm.agent_status": {
          if (!connectionId) return;
          await handleAgentStatus(connectionId, msg, machineName);
          break;
        }

        case "vm.agent_message": {
          if (!connectionId) return;
          await handleAgentMessage(connectionId, msg, machineName);
          break;
        }

        case "vm.task_done": {
          if (!connectionId) return;
          await handleTaskDone(connectionId, msg, machineName);
          break;
        }

        case "vm.task_ack": {
          if (!connectionId) return;
          await handleTaskAck(connectionId, msg, machineName);
          break;
        }

        case "vm.session_done": {
          handleSessionDone(msg, machineName);
          break;
        }

        default:
          logVMActivity(
            machineName,
            `Unknown message type received: "${(msg as any).type}"`,
            "warn",
          ).catch(() => undefined);
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
      logVMActivity(machineName, `Plugin disconnected (${machineName ?? "unknown host"})`).catch(
        () => undefined,
      );
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
        logVMActivity(
          null,
          `Evicting stale connection ${id} — no activity for ${Math.round(LIVE_GATEWAY.MC_EVICT_TIMEOUT_MS / 1000)}s`,
          "warn",
        ).catch(() => undefined);
        conn.ws.terminate(); // triggers "close" which handles cleanup
      }
    }
  }, LIVE_GATEWAY.EVICTION_CHECK_MS);
}
