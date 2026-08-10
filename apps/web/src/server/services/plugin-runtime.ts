import { prisma } from "@/server/prisma";
import {
  buildMinimalWorkerEnv,
  isPluginEffective,
  FLAG_KEYS,
  type PluginLifecycleState,
} from "@agentcenter/utils";
import { isFeatureEnabled } from "@/server/feature-flags";
import { badRequest } from "./service-errors";
import { assertPluginCapability } from "./plugin-grants";
import { resolvePluginTool } from "./plugin-tools";
import { claimNextPluginJob, completePluginJob, failPluginJob } from "./plugin-jobs";
import { getPluginWorkerManager, type ForkPluginWorkerManager } from "./plugin-worker-manager";
import type { PluginJob } from "@agentcenter/database";

// Plugin EXECUTION runtime (parity #127/#128/#129 — wiring the registry to a live worker). This layer
// ties together: (1) the fork-based worker manager, (2) fail-closed capability enforcement
// (plugin-grants), and (3) the tool/job dispatch surface. It is FLAG-GATED on PLUGIN_RUNTIME — with the
// flag off every entry point refuses, so this whole path is dark by default.
//
// Capabilities the runtime enforces:
//   • tool dispatch  → requires the plugin hold `agent.tools.register` (its tool-surface grant)
//   • job execution  → requires the plugin hold `jobs.schedule`
// Both funnel through assertPluginCapability, so an ungranted plugin is refused before any worker runs.

/** Capability a plugin must hold for its contributed tools to be dispatchable. */
export const PLUGIN_TOOL_CAPABILITY = "agent.tools.register" as const;
/** Capability a plugin must hold for its jobs to execute. */
export const PLUGIN_JOB_CAPABILITY = "jobs.schedule" as const;

// ── First-party entrypoint registry (the "no arbitrary code" boundary) ────────────────────────────
// A plugin worker loads a module by path. We deliberately DO NOT derive that path from the (untrusted)
// manifest — loading arbitrary installed npm code is a documented security seam. Instead a first-party /
// in-repo plugin registers its module here explicitly. Registry-only plugins have no entrypoint and
// cannot be executed (they remain inert metadata).
const entrypoints = new Map<string, string>();

export function registerPluginEntrypoint(pluginId: string, modulePath: string): void {
  entrypoints.set(pluginId, modulePath);
}
export function unregisterPluginEntrypoint(pluginId: string): void {
  entrypoints.delete(pluginId);
}
export function resolvePluginEntrypoint(pluginId: string): string | null {
  return entrypoints.get(pluginId) ?? null;
}

async function requireRuntimeEnabled(): Promise<void> {
  if (!(await isFeatureEnabled(FLAG_KEYS.PLUGIN_RUNTIME)))
    badRequest("Plugin runtime is not enabled");
}

async function requireEffectivePlugin(workspaceId: string, pluginId: string): Promise<void> {
  const plugin = await prisma.plugin.findUnique({
    where: { workspaceId_pluginId: { workspaceId, pluginId } },
    select: { status: true, enabled: true },
  });
  const state: PluginLifecycleState = {
    status: (plugin?.status as PluginLifecycleState["status"]) ?? "error",
    enabled: plugin?.enabled ?? false,
    removed: !plugin,
  };
  if (!isPluginEffective(state))
    badRequest(`plugin '${pluginId}' is not effective (installed+enabled)`);
}

/**
 * Ensure a worker is running for a plugin, then return the manager. Builds a MINIMAL env
 * (buildMinimalWorkerEnv — never the ambient host env, so no DATABASE_URL/secret leaks into plugin code).
 * Throws if the plugin has no registered runtime entrypoint (registry-only → inert).
 */
export async function ensurePluginWorker(
  _workspaceId: string,
  pluginId: string,
  manager: ForkPluginWorkerManager = getPluginWorkerManager(),
): Promise<ForkPluginWorkerManager> {
  const modulePath = resolvePluginEntrypoint(pluginId);
  if (!modulePath)
    badRequest(`plugin '${pluginId}' has no runtime entrypoint (registry-only plugins are inert)`);
  if (!manager.isRunning(pluginId)) {
    // Minimal env: start EMPTY, allow only NODE_ENV (non-secret). No plugin config/secrets are injected
    // into the process env — a secrets channel is a separate seam.
    const env = buildMinimalWorkerEnv(process.env, ["NODE_ENV"]);
    await manager.start(pluginId, modulePath, env);
  }
  return manager;
}

/**
 * Dispatch a tool call into its owning plugin's worker (capability-checked, fail-closed) and return the
 * result. Resolution: tool name → enabled tool → owning plugin must be effective → plugin must hold the
 * tool-surface capability grant → worker invoke over JSON-RPC.
 */
export async function dispatchPluginTool(
  workspaceId: string,
  toolName: string,
  args: unknown,
  opts: { manager?: ForkPluginWorkerManager } = {},
): Promise<unknown> {
  await requireRuntimeEnabled();
  const tool = await resolvePluginTool(workspaceId, toolName);
  if (!tool) badRequest(`no enabled tool named '${toolName}'`);
  await requireEffectivePlugin(workspaceId, tool.pluginId);
  // FAIL-CLOSED: refuse unless the plugin holds the tool-surface capability grant.
  await assertPluginCapability(workspaceId, tool.pluginId, PLUGIN_TOOL_CAPABILITY);
  const manager = await ensurePluginWorker(workspaceId, tool.pluginId, opts.manager);
  return manager.invoke(tool.pluginId, "invoke", { kind: "tool", name: toolName, args });
}

/**
 * Execute a single claimed job in its plugin's worker (capability-checked). Returns the worker result.
 * Throws (so the caller can fail/retry the job) on capability denial or worker error.
 */
export async function runPluginJobInWorker(
  workspaceId: string,
  job: Pick<PluginJob, "pluginId" | "jobKey" | "payload">,
  opts: { manager?: ForkPluginWorkerManager } = {},
): Promise<unknown> {
  await requireEffectivePlugin(workspaceId, job.pluginId);
  await assertPluginCapability(workspaceId, job.pluginId, PLUGIN_JOB_CAPABILITY);
  const manager = await ensurePluginWorker(workspaceId, job.pluginId, opts.manager);
  return manager.invoke(job.pluginId, "invoke", {
    kind: "job",
    name: job.jobKey,
    payload: job.payload,
  });
}

export interface DrainResult {
  claimed: number;
  completed: number;
  failed: number;
  jobId?: string;
}

/**
 * Drain ONE due plugin job: claim it (race-safe lease), run it in the worker, and settle it
 * (complete/fail with the existing retry/backoff policy). FLAG-GATED on PLUGIN_RUNTIME — a no-op when
 * off. The scheduler/reaper loop calls this repeatedly; returns a summary of what happened. Errors are
 * caught and routed to failPluginJob so a bad job never crashes the drain loop.
 */
export async function drainDuePluginJob(
  workspaceId: string,
  workerId: string,
  opts: { manager?: ForkPluginWorkerManager } = {},
): Promise<DrainResult> {
  if (!(await isFeatureEnabled(FLAG_KEYS.PLUGIN_RUNTIME)))
    return { claimed: 0, completed: 0, failed: 0 };
  const job = await claimNextPluginJob(workspaceId, workerId);
  if (!job) return { claimed: 0, completed: 0, failed: 0 };
  try {
    const result = await runPluginJobInWorker(workspaceId, job, opts);
    await completePluginJob(workspaceId, job.id, result as never);
    return { claimed: 1, completed: 1, failed: 0, jobId: job.id };
  } catch (err) {
    await failPluginJob(workspaceId, job.id, err instanceof Error ? err.message : String(err));
    return { claimed: 1, completed: 0, failed: 1, jobId: job.id };
  }
}
