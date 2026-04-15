/**
 * openclaw-local.ts
 *
 * Thin abstraction over OpenClaw's native plugin API.
 * Uses api.runtime.agent.runEmbeddedAgent() for task delivery and api.config (agent list) — no subprocess.
 */

import type { AgentInfo } from "@agentcenter/types";

/**
 * List agents via the native OpenClaw config (api.config.agents.list).
 * Uses api.runtime.agent.resolveAgentIdentity() for the agent DB ID — no direct
 * filesystem reads, keeping file I/O inside OpenClaw's own runtime.
 */
export async function listLocalAgents(api: any): Promise<AgentInfo[]> {
  try {
    const list: any[] = api?.config?.agents?.list ?? [];
    return Promise.all(
      list.map(async (entry: any) => {
        let agentId: string | null = null;
        try {
          const identity = await api.runtime.agent.resolveAgentIdentity(entry);
          agentId = identity?.id ?? null;
        } catch { /* identity not resolvable — agentId remains null */ }
        return {
          slug: (entry.id ?? entry.name) as string,
          name: (entry.name ?? entry.id) as string,
          status: "idle" as const,
          agentId,
        };
      }),
    );
  } catch {
    return [];
  }
}

/**
 * Deliver a task notification to a local agent via the native embedded agent runner.
 * Uses api.runtime.agent.runEmbeddedAgent() — the "normal OpenClaw agent turn" helper.
 * This runs the agent embedded inside the daemon (no subprocess, no pairing required).
 * Fire-and-forget: we don't await completion — agent turns can run for minutes.
 */
export async function deliverToLocalAgent(
  api: any,
  agentSlug: string,
  taskNotification: string,
): Promise<void> {
  // Resolve the agent's config entry so we can get workspaceDir and timeoutMs
  const list: any[] = api?.config?.agents?.list ?? [];
  const cfg = list.find((e: any) => (e.id ?? e.name) === agentSlug);

  if (!cfg) {
    console.warn(`[agentcenter-bridge] deliverToLocalAgent: agent "${agentSlug}" not found in config list — falling back to subagent.run`);
    // Agent not found in config — fallback to subagent.run so delivery is attempted
    await api.runtime.subagent.run({
      sessionKey: `agent:${agentSlug}`,
      message: taskNotification,
    });
    return;
  }

  const { randomUUID } = await import("node:crypto");
  const { join } = await import("node:path");

  const runId = randomUUID();
  let baseDir: string;
  try {
    baseDir = await api.runtime.agent.resolveAgentWorkspaceDir(cfg);
  } catch (err) {
    console.error(`[agentcenter-bridge] deliverToLocalAgent: resolveAgentWorkspaceDir failed for "${agentSlug}":`, err);
    return;
  }

  // resolveAgentWorkspaceDir may return the root workspace; ensure we use an
  // agent-specific subdirectory so agents don't share IDENTITY.md / sessions.
  const workspaceDir = baseDir.endsWith(`/${agentSlug}`) ? baseDir : join(baseDir, agentSlug);

  console.log(`[agentcenter-bridge] deliverToLocalAgent: starting runEmbeddedAgent for "${agentSlug}" runId=${runId} workspace=${workspaceDir}`);

  // Return the promise so callers (runAgentSession) can track completion and
  // enforce one-at-a-time per agent. Do NOT fire-and-forget here.
  return api.runtime.agent
    .runEmbeddedAgent({
      sessionId: `mc-bridge:${agentSlug}:${runId}`,
      runId,
      sessionFile: join(workspaceDir, "sessions", `mc-bridge-${runId}.jsonl`),
      workspaceDir,
      prompt: taskNotification,
      timeoutMs: api.runtime.agent.resolveAgentTimeoutMs(cfg),
    })
    .then(() => {
      console.log(`[agentcenter-bridge] deliverToLocalAgent: runEmbeddedAgent completed for "${agentSlug}" runId=${runId}`);
    })
    .catch((err: unknown) => {
      console.error(`[agentcenter-bridge] deliverToLocalAgent: runEmbeddedAgent FAILED for "${agentSlug}" runId=${runId}:`, err);
      throw err;
    });
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
  return oc.events.on("agent:statusChange", (event: any) => {
    const slug = event.slug ?? event.id ?? event.name;
    handler({
      slug,
      status: event.status,
      detailedStatus: event.detailedStatus ?? null,
      statusMessage: event.statusMessage ?? null,
      currentTaskId: event.currentTaskId ?? null,
      agentId: event.agentId ?? null,
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
