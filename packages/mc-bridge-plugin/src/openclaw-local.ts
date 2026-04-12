/**
 * openclaw-local.ts
 *
 * Thin abstraction over OpenClaw's local plugin API.
 *
 * According to OpenClaw docs, plugins interact with the runtime through:
 * - The `api` object received in the register() callback (registerHook, registerTool, etc.)
 * - The `openclaw system event` CLI mechanism for triggering agent turns
 *
 * OpenClaw does NOT expose a triggerCycle/triggerHeartbeat API for plugins.
 * The closest equivalent is `openclaw system event --text "..." --mode now`
 * which causes the target agent to immediately process a new turn.
 *
 * All `(globalThis as any).openclaw.*` calls below are the runtime bridge that
 * OpenClaw injects into the plugin process. These are the actual available globals
 * based on the OpenClaw plugin runtime contract.
 */

import type { AgentInfo } from "@agentcenter/types";

/**
 * Read the Agent ID from an agent's IDENTITY.md workspace file.
 * Returns null if the file doesn't exist or the field isn't present.
 */
async function readAgentIdFromIdentity(slug: string): Promise<string | null> {
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const agentsDir = await resolveAgentsDir();
    if (!agentsDir) return null;
    const identityPath = path.join(agentsDir, slug, "workspace", "IDENTITY.md");
    const content = fs.readFileSync(identityPath, "utf8");
    const match = content.match(/\*\*Agent ID\*\*:\s*(\S+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the OpenClaw agents directory across platforms.
 *
 * Search order:
 *  1. ~/.openclaw/agents          — Mac, Linux, and Windows (dotfile convention)
 *  2. %APPDATA%\OpenClaw\agents   — Windows Electron/GUI apps
 *  3. ~/Library/Application Support/OpenClaw/agents — Mac Electron/GUI apps
 *
 * Returns the first directory that exists, or null if none found.
 */
async function resolveAgentsDir(): Promise<string | null> {
  const os = await import("node:os");
  const fs = await import("node:fs");
  const path = await import("node:path");

  const candidates: string[] = [
    path.join(os.homedir(), ".openclaw", "agents"),
  ];

  if (process.platform === "win32") {
    const appData = process.env["APPDATA"];
    if (appData) candidates.push(path.join(appData, "OpenClaw", "agents"));
    const localAppData = process.env["LOCALAPPDATA"];
    if (localAppData) candidates.push(path.join(localAppData, "OpenClaw", "agents"));
  } else if (process.platform === "darwin") {
    candidates.push(path.join(os.homedir(), "Library", "Application Support", "OpenClaw", "agents"));
  } else {
    // Linux XDG
    const xdgConfig = process.env["XDG_CONFIG_HOME"] ?? path.join(os.homedir(), ".config");
    candidates.push(path.join(xdgConfig, "openclaw", "agents"));
  }

  for (const dir of candidates) {
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch {
      // not found, try next
    }
  }
  return null;
}

/**
 * List agents from the filesystem by scanning the OpenClaw agents directory.
 * Used as a fallback when the OpenClaw runtime API is not available.
 */
async function listAgentsFromFilesystem(): Promise<AgentInfo[]> {
  try {
    const fs = await import("node:fs");
    const agentsDir = await resolveAgentsDir();
    if (!agentsDir) return [];
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    const agents: AgentInfo[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const slug = entry.name;
      const agentId = await readAgentIdFromIdentity(slug);
      agents.push({
        slug,
        name: slug,
        status: "idle",
        agentId,
      });
    }
    return agents;
  } catch {
    return [];
  }
}

/** List agents currently running in this OpenClaw instance. */
export async function listLocalAgents(): Promise<AgentInfo[]> {
  const oc = (globalThis as any).openclaw;

  // Primary path: use OpenClaw runtime API
  if (typeof oc?.agents?.list === "function") {
    const raw: any[] = await oc.agents.list();
    return Promise.all(
      raw.map(async (a: any) => {
        const slug = a.slug ?? a.id ?? a.name;
        return {
          slug,
          name: a.name,
          status: (a.status ?? "idle") as "idle" | "active" | "blocked",
          detailedStatus: a.detailedStatus ?? null,
          statusMessage: a.statusMessage ?? null,
          currentTaskId: a.currentTaskId ?? null,
          agentId: a.agentId ?? (await readAgentIdFromIdentity(slug)),
        };
      }),
    );
  }

  // Fallback: scan ~/.openclaw/agents/ directory
  return listAgentsFromFilesystem();
}

/**
 * Deliver a task notification to a local agent.
 *
 * OpenClaw docs confirm there is no plugin API to directly trigger an agent's
 * heartbeat-preflight cycle. The correct mechanism is sending a system event
 * to the agent with `--mode now`, which causes it to immediately process a new
 * turn — equivalent to `openclaw agent -m "message" --to <slug>`.
 *
 * The taskNotification message MUST include the taskId so the agent can call
 * MC APIs (status update, action logging, completion). The agent's PLAYBOOK
 * must treat this incoming message as a task assignment and run the full MC
 * API chain: fetch task → update status → work → log actions → mark done.
 *
 * This IS the OpenClaw-sanctioned way for plugins to initiate agent work.
 * It is not identical to heartbeat-preflight (skips vacation/shutdown checks)
 * but the agent's PLAYBOOK handles those when it calls back to MC APIs.
 */
export async function deliverToLocalAgent(agentSlug: string, taskNotification: string): Promise<void> {
  // Primary path: enqueue an immediate system event for this agent.
  // Equivalent to: openclaw system event --text "..." --mode now --to <slug>
  const oc = (globalThis as any).openclaw;
  if (typeof oc.system?.event === "function") {
    await oc.system.event({ text: taskNotification, to: agentSlug, mode: "now" });
    return;
  }

  // Fallback: direct agent message (older OpenClaw runtimes).
  // openclaw agent -m "message" --to <slug>
  await oc.agents.sendMessage(agentSlug, taskNotification);
}

/** Subscribe to agent status change events. */
export function onAgentStatusChange(
  handler: (event: {
    slug: string;
    status: string;
    detailedStatus?: string | null;
    statusMessage?: string | null;
    currentTaskId?: string | null;
    agentId?: string | null;
  }) => void,
): () => void {
  const oc = (globalThis as any).openclaw;
  if (typeof oc?.events?.on !== "function") return () => {};
  return oc.events.on("agent:statusChange", async (event: any) => {
    const slug = event.slug ?? event.id ?? event.name;
    handler({
      slug,
      status: event.status,
      detailedStatus: event.detailedStatus ?? null,
      statusMessage: event.statusMessage ?? null,
      currentTaskId: event.currentTaskId ?? null,
      agentId: event.agentId ?? (await readAgentIdFromIdentity(slug)),
    });
  });
}

/** Subscribe to agent message events (outgoing). */
export function onAgentMessage(
  handler: (event: {
    slug: string;
    taskId?: string | null;
    content: string;
  }) => void,
): () => void {
  const oc = (globalThis as any).openclaw;
  if (typeof oc?.events?.on !== "function") return () => {};
  return oc.events.on("agent:message", handler);
}

/** Subscribe to task done events. */
export function onTaskDone(
  handler: (event: { slug: string; taskId: string; summary?: string }) => void,
): () => void {
  const oc = (globalThis as any).openclaw;
  if (typeof oc?.events?.on !== "function") return () => {};
  return oc.events.on("agent:taskDone", handler);
}

/** Derive a stable machine fingerprint (hostname + first non-loopback MAC). */
export async function deriveMachineFingerprint(): Promise<string> {
  const os = await import("node:os");
  const crypto = await import("node:crypto");

  const hostname = os.hostname();
  const ifaces = os.networkInterfaces();
  let mac = "";
  for (const list of Object.values(ifaces)) {
    for (const iface of list ?? []) {
      if (!iface.internal && iface.mac && iface.mac !== "00:00:00:00:00:00") {
        mac = iface.mac;
        break;
      }
    }
    if (mac) break;
  }

  return crypto
    .createHash("sha256")
    .update(`${hostname}:${mac}`)
    .digest("hex")
    .slice(0, 32);
}
