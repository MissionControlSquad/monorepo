/**
 * openclaw-local.ts
 *
 * Thin abstraction over OpenClaw's local plugin API.
 * Centralizes all calls to `openclaw.*` globals so the rest of the plugin
 * can be tested without the OpenClaw runtime.
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
  // OpenClaw plugin API: openclaw.agents.list()
  const raw: any[] = await (globalThis as any).openclaw.agents.list();
  return raw.map((a: any) => ({
    slug: a.slug ?? a.name,
    name: a.name,
    status: a.status ?? "idle",
    detailedStatus: a.detailedStatus ?? null,
    statusMessage: a.statusMessage ?? null,
    currentTaskId: a.currentTaskId ?? null,
  }));
}

/** Send a task message to a specific local agent. */
export async function deliverToLocalAgent(agentSlug: string, message: string): Promise<void> {
  await (globalThis as any).openclaw.agents.sendMessage(agentSlug, message);
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
  return (globalThis as any).openclaw.events.on("agent:statusChange", handler);
}

/** Subscribe to agent message events (outgoing). */
export function onAgentMessage(
  handler: (event: {
    slug: string;
    taskId?: string | null;
    content: string;
  }) => void,
): () => void {
  return (globalThis as any).openclaw.events.on("agent:message", handler);
}

/** Subscribe to task done events. */
export function onTaskDone(
  handler: (event: { slug: string; taskId: string; summary?: string }) => void,
): () => void {
  return (globalThis as any).openclaw.events.on("agent:taskDone", handler);
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
