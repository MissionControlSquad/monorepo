import { prisma } from "@/server/prisma";
import {
  FLAG_KEYS,
  isPluginEffective,
  type PluginApiRoute,
  type PluginLifecycleState,
  type PluginManifest,
  type PluginCapability,
} from "@agentcenter/utils";
import { isFeatureEnabled } from "@/server/feature-flags";
import { assertPluginCapability } from "./plugin-grants";
import { ensurePluginWorker } from "./plugin-runtime";
import type { ForkPluginWorkerManager } from "./plugin-worker-manager";

// Scoped plugin API routes (§3 plugins). A plugin declares `apiRoutes` in its manifest; the host mounts
// them under /api/plugins/<id>/x/<path> and DISPATCHES the call into the plugin worker — capability
// checked, fail-closed. This is the registry-match + capability gate + worker dispatch; the route file
// is a thin adapter over it. FLAG-GATED on PLUGIN_RUNTIME (dark by default). Workspace-scoped (D5).

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Typed refusal — `status` maps straight to the HTTP response so the route stays thin. */
export class PluginApiRouteError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PluginApiRouteError";
  }
}

function manifestApiRoutes(manifest: unknown): PluginApiRoute[] {
  if (!manifest || typeof manifest !== "object") return [];
  const r = (manifest as Partial<PluginManifest>).apiRoutes;
  return Array.isArray(r) ? (r as PluginApiRoute[]) : [];
}

/** Normalize a path for comparison: ensure a single leading slash, drop a trailing slash. */
export function normalizeRoutePath(path: string): string {
  const p = "/" + path.replace(/^\/+/, "").replace(/\/+$/, "");
  return p === "/" ? "/" : p;
}

/**
 * Find the declared route for (method, path). Pure over a manifest — unit-testable. Method defaults to
 * GET when a manifest omits it (matches the zod default). Returns null when nothing matches.
 */
export function matchDeclaredApiRoute(
  manifest: unknown,
  method: string,
  path: string,
): PluginApiRoute | null {
  const wantPath = normalizeRoutePath(path);
  const wantMethod = method.toUpperCase();
  return (
    manifestApiRoutes(manifest).find(
      (r) =>
        (r.method ?? "GET").toUpperCase() === wantMethod && normalizeRoutePath(r.path) === wantPath,
    ) ?? null
  );
}

export interface DispatchApiRouteInput {
  workspaceId: string;
  pluginId: string;
  method: string;
  /** The sub-path after /api/plugins/<id>/x — e.g. "/status" or "status". */
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Dispatch a scoped plugin API call into the plugin's worker. Gates (all fail-closed):
 *   1. PLUGIN_RUNTIME flag on           → else 403
 *   2. plugin installed + effective     → else 404 (no existence leak)
 *   3. manifest declares (method,path)  → else 404
 *   4. route.capability GRANTED         → else 403 (PluginCapabilityDeniedError normalized)
 *   5. worker invoke ({kind:"api"})     → the plugin's `routes[handler]` returns the response
 * The `handler` key defaults to `<METHOD> <path>` when the manifest omits it.
 */
export async function dispatchPluginApiRoute(
  input: DispatchApiRouteInput,
  opts: { manager?: ForkPluginWorkerManager } = {},
): Promise<unknown> {
  const { workspaceId, pluginId, method, path } = input;

  if (!(await isFeatureEnabled(FLAG_KEYS.PLUGIN_RUNTIME)))
    throw new PluginApiRouteError(403, "FEATURE_DISABLED", "Plugin runtime is not enabled");

  const plugin = await prisma.plugin.findUnique({
    where: { workspaceId_pluginId: { workspaceId, pluginId } },
    select: { status: true, enabled: true, manifest: true },
  });
  if (!plugin) throw new PluginApiRouteError(404, "NOT_FOUND", "Plugin not found");
  const state: PluginLifecycleState = {
    status: plugin.status as PluginLifecycleState["status"],
    enabled: plugin.enabled,
  };
  if (!isPluginEffective(state))
    throw new PluginApiRouteError(404, "NOT_FOUND", "Plugin not found");

  const route = matchDeclaredApiRoute(plugin.manifest, method, path);
  if (!route) throw new PluginApiRouteError(404, "NOT_FOUND", "Route not declared");

  // Fail-closed capability gate. A route MAY declare a required capability; if it does, it must be
  // granted. (Manifest validation already guarantees it is a real, declared capability.)
  if (route.capability) {
    try {
      await assertPluginCapability(workspaceId, pluginId, route.capability as PluginCapability);
    } catch {
      throw new PluginApiRouteError(
        403,
        "CAPABILITY_DENIED",
        `plugin '${pluginId}' is not granted '${route.capability}'`,
      );
    }
  }

  const handler =
    route.handler ?? `${(route.method ?? "GET").toUpperCase()} ${normalizeRoutePath(route.path)}`;
  const manager = await ensurePluginWorker(workspaceId, pluginId, opts.manager);
  return manager.invoke(pluginId, "invoke", {
    kind: "api",
    name: handler,
    args: {
      method: method.toUpperCase(),
      path: normalizeRoutePath(path),
      query: input.query ?? {},
      body: input.body ?? null,
      headers: input.headers ?? {},
    },
  });
}
