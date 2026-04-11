/**
 * live-gateway-handler.ts
 *
 * Handles all WebSocket messages from mc-bridge plugin connections.
 * Each VM maintains one persistent outbound WS connection to MC.
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
  findVMByFingerprint,
  markVMConnected,
  markVMDisconnected,
  listActiveInstallTokens,
  touchInstallToken,
  consumeNonce,
  drainPendingTasks,
  markTaskDelivered,
  findAgentByVmAndSlug,
  logCloudVMEvent,
  updateAgent,
} from "@agentcenter/database";
import { vmLiveRegistry } from "./vm-live-registry";
import { pubsub, PubSubEvent, vmConnectionTopic } from "@agentcenter/graphql-server";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function send(ws: WebSocket, msg: MCToPlugin): void {
  if (ws.readyState === 1 /* OPEN */) ws.send(JSON.stringify(msg));
}

function sendError(ws: WebSocket, code: VMErrorCode, message: string): void {
  send(ws, { type: "mc.error", code, message });
}

async function logVM(vmId: string, message: string, level: "info" | "warn" | "error" = "info") {
  await logCloudVMEvent(vmId, message, level).catch(() => undefined);
}

/** Strip all HTML tags from a string (server-side, no DOM required). */
function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "").trim();
}

// ─── Install token lookup ─────────────────────────────────────────────────────

/**
 * Find the first active install token whose hash matches the raw token.
 * Returns the token record or null if none match.
 */
async function findValidInstallToken(rawToken: string) {
  const tokens = await listActiveInstallTokens();
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

  // 2. Atomic nonce consumption — prevents replay attacks
  const nonceOk = await consumeNonce(msg.nonce);
  if (!nonceOk) {
    sendError(ws, "nonce_replay", "Nonce already used");
    return null;
  }

  // 3. Check if fingerprint already registered (reconnect path)
  const existingVM = await findVMByFingerprint(msg.fingerprint);

  if (existingVM) {
    // Reconnect: verify per-VM token
    if (!existingVM.vmToken || !(await bcrypt.compare(msg.token, existingVM.vmToken))) {
      sendError(ws, "auth_failed", "Invalid VM token");
      return null;
    }

    const vmId = existingVM.id;
    await markVMConnected(vmId, msg.pluginVersion, msg.meta as unknown as Record<string, unknown>);

    send(ws, { type: "mc.welcome", vmId });
    await logVM(vmId, `Plugin reconnected (v${msg.pluginVersion})`);
    return vmId;
  }

  // 4. First connect: validate against an install token
  const installToken = await findValidInstallToken(msg.token);
  if (!installToken) {
    sendError(ws, "auth_failed", "Invalid install token");
    return null;
  }

  // 5. Create a new CloudVM record on first connect.
  //    vmFingerprint @unique ensures only one record per machine.
  const { prisma } = await import("../prisma");
  let vmId: string;
  try {
    const rawVMToken = randomBytes(32).toString("hex");
    const vmTokenHash = await bcrypt.hash(rawVMToken, 12);

    const vm = await prisma.cloudVM.create({
      data: {
        name: msg.meta.hostname,
        hostingType: "selfHosted",
        vmFingerprint: msg.fingerprint,
        vmToken: vmTokenHash,
        connectionStatus: "connected",
        connectedAt: new Date(),
        pluginVersion: msg.pluginVersion,
        hostMeta: msg.meta as any,
        status: "running",
      } as any,
    });

    vmId = vm.id;
    await touchInstallToken(installToken.id);
    await logVM(vmId, `New VM registered via install token (v${msg.pluginVersion})`);

    // Send welcome with raw vmToken (shown once — plugin must persist it)
    send(ws, { type: "mc.welcome", vmId, vmToken: rawVMToken });
  } catch (err: any) {
    // vmFingerprint unique violation — race on simultaneous first-connect
    if (err?.code === "P2002") {
      sendError(ws, "internal_error", "Fingerprint collision, please retry");
    } else {
      sendError(ws, "internal_error", "Registration failed");
    }
    return null;
  }

  return vmId;
}

// ─── vm.agents_report handler ─────────────────────────────────────────────────

async function handleAgentsReport(vmId: string, msg: MsgAgentsReport): Promise<void> {
  for (const info of msg.agents) {
    const agent = await findAgentByVmAndSlug(vmId, info.slug).catch(() => null);
    if (!agent) continue;
    await updateAgent(agent.id, {
      status: info.status,
      detailedStatus: info.detailedStatus ?? null,
      statusMessage: info.statusMessage ?? null,
      currentTaskId: info.currentTaskId ?? null,
    } as any).catch(() => undefined);
    pubsub.publish(PubSubEvent.AGENT.STATUS_CHANGED, { agentId: agent.id });
  }
}

// ─── vm.agent_status handler ──────────────────────────────────────────────────

async function handleAgentStatus(vmId: string, msg: MsgAgentStatus): Promise<void> {
  const agent = await findAgentByVmAndSlug(vmId, msg.slug).catch(() => null);
  if (!agent) return;
  await updateAgent(agent.id, {
    status: msg.status,
    detailedStatus: msg.detailedStatus ?? null,
    statusMessage: msg.statusMessage ?? null,
    currentTaskId: msg.currentTaskId ?? null,
  } as any).catch(() => undefined);
  pubsub.publish(PubSubEvent.AGENT.STATUS_CHANGED, { agentId: agent.id });
}

// ─── vm.agent_message handler ─────────────────────────────────────────────────

async function handleAgentMessage(vmId: string, msg: MsgAgentMessage): Promise<void> {
  const clean = stripHtml(msg.content);
  if (!clean) return;

  // If agent + task are known, log as an agent action
  if (msg.taskId) {
    const agent = await findAgentByVmAndSlug(vmId, msg.slug).catch(() => null);
    if (agent) {
      const { prisma } = await import("../prisma");
      const action = await prisma.agentAction
        .create({
          data: {
            agentId: agent.id,
            taskId: msg.taskId,
            actionType: "status_update",
            description: clean,
            metadata: { source: "live_gateway", timestamp: msg.timestamp },
          },
        })
        .catch(() => null);
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

async function handleTaskDone(_vmId: string, msg: MsgTaskDone): Promise<void> {
  const { prisma } = await import("../prisma");
  await prisma.task
    .updateMany({
      where: { id: msg.taskId },
      data: { status: "done" },
    })
    .catch(() => undefined);
  pubsub.publish(PubSubEvent.TASK.UPDATED, { taskId: msg.taskId });
}

// ─── vm.task_ack handler ──────────────────────────────────────────────────────

async function handleTaskAck(msg: MsgTaskAck): Promise<void> {
  await markTaskDelivered(msg.deliveryId).catch(() => undefined);
}

// ─── Pending task drain ───────────────────────────────────────────────────────

async function drainAndDeliverPending(vmId: string, ws: WebSocket): Promise<void> {
  const pending = await drainPendingTasks(vmId);
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
  let vmId: string | null = null;
  let helloReceived = false;

  // Enforce hello timeout — close if no hello within 10s
  const helloTimer = setTimeout(() => {
    if (!helloReceived) ws.terminate();
  }, 10_000);

  ws.on("message", async (raw) => {
    let msg: PluginToMC;
    try {
      msg = JSON.parse(raw.toString()) as PluginToMC;
    } catch {
      return; // ignore unparseable frames
    }

    // Update last-seen timestamp for eviction tracking
    if (vmId) vmLiveRegistry.touch(vmId);

    try {
      switch (msg.type) {
        case "vm.hello": {
          if (helloReceived) return; // ignore duplicate hellos
          helloReceived = true;
          clearTimeout(helloTimer);

          const resolvedId = await handleHello(ws, msg);
          if (!resolvedId) {
            ws.terminate();
            return;
          }

          vmId = resolvedId;
          vmLiveRegistry.add({
            vmId,
            ws,
            connectedAt: new Date(),
            lastMessageAt: new Date(),
            pluginVersion: msg.pluginVersion,
          });

          // Drain queued tasks immediately
          await drainAndDeliverPending(vmId, ws);

          // Notify subscribers of VM connection
          pubsub.publish(vmConnectionTopic(vmId), { vmId, connected: true });
          break;
        }

        case "vm.ping": {
          if (!vmId) return;
          send(ws, { type: "mc.pong", timestamp: Date.now() });
          break;
        }

        case "vm.agents_report": {
          if (!vmId) return;
          await handleAgentsReport(vmId, msg);
          break;
        }

        case "vm.agent_status": {
          if (!vmId) return;
          await handleAgentStatus(vmId, msg);
          break;
        }

        case "vm.agent_message": {
          if (!vmId) return;
          await handleAgentMessage(vmId, msg);
          break;
        }

        case "vm.task_done": {
          if (!vmId) return;
          await handleTaskDone(vmId, msg);
          break;
        }

        case "vm.task_ack": {
          await handleTaskAck(msg);
          break;
        }

        default:
          // Unknown message type — ignore for forward compatibility
          break;
      }
    } catch (err) {
      console.error("[live-gateway] Unhandled error in message handler:", err);
    }
  });

  ws.on("close", async () => {
    clearTimeout(helloTimer);
    if (vmId) {
      vmLiveRegistry.remove(vmId);
      await markVMDisconnected(vmId).catch(() => undefined);
      await logVM(vmId, "Plugin disconnected");
      pubsub.publish(vmConnectionTopic(vmId), { vmId, connected: false });
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
    const stale = vmLiveRegistry.staleIds(LIVE_GATEWAY.MC_EVICT_TIMEOUT_MS);
    for (const vmId of stale) {
      const conn = vmLiveRegistry.get(vmId);
      if (conn) {
        console.warn(`[live-gateway] Evicting stale connection: ${vmId}`);
        conn.ws.terminate(); // triggers "close" event which handles cleanup
      }
    }
  }, 30_000);
}
