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

/** List agents currently running in this OpenClaw instance. */
export async function listLocalAgents(): Promise<
  Array<{
    slug: string;
    name: string;
    status: string;
    detailedStatus?: string | null;
    statusMessage?: string | null;
    currentTaskId?: string | null;
  }>
> {
  const oc = (globalThis as any).openclaw;
  if (typeof oc?.agents?.list !== "function") return [];
  const raw: any[] = await oc.agents.list();
  return raw.map((a: any) => ({
    slug: a.slug ?? a.name,
    name: a.name,
    status: a.status ?? "idle",
    detailedStatus: a.detailedStatus ?? null,
    statusMessage: a.statusMessage ?? null,
    currentTaskId: a.currentTaskId ?? null,
  }));
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
  }) => void,
): () => void {
  const oc = (globalThis as any).openclaw;
  if (typeof oc?.events?.on !== "function") return () => {};
  return oc.events.on("agent:statusChange", handler);
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
