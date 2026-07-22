/**
 * Plugin lifecycle + runtime capability grants (parity #114 / #103). PURE — no I/O. The registry service
 * persists the resulting state; the runtime consults these guards before dispatching to a plugin.
 *
 * Lifecycle is modelled as (status, enabled) — matching the Plugin model — with a small set of operator
 * actions. A plugin is *effective* (may run) only when installed/enabled and turned on. Capabilities are
 * declared in the manifest and separately GRANTED at install; a runtime call must be covered by a grant.
 */
import { isPluginCapability, type PluginCapability } from "./plugin-constants";

export const PLUGIN_STATUSES = ["installed", "disabled", "error"] as const;
export type PluginLifecycleStatus = (typeof PLUGIN_STATUSES)[number];

export type PluginAction = "enable" | "disable" | "fail" | "clearError" | "uninstall";

export interface PluginLifecycleState {
  status: PluginLifecycleStatus;
  enabled: boolean;
  /** Terminal: the plugin row is gone. Represented as a flag so callers can branch without null. */
  removed?: boolean;
}

export class PluginLifecycleError extends Error {}

/**
 * Apply an operator action to a lifecycle state, returning the next state. Throws on an illegal
 * transition (e.g. enabling a removed plugin). Deterministic and side-effect-free.
 */
export function nextPluginState(
  current: PluginLifecycleState,
  action: PluginAction,
): PluginLifecycleState {
  if (current.removed) throw new PluginLifecycleError("plugin is uninstalled");
  switch (action) {
    case "enable":
      // Re-enabling clears a disabled state; you cannot enable directly out of `error` (clear it first).
      if (current.status === "error")
        throw new PluginLifecycleError("clear the error before enabling");
      return { status: "installed", enabled: true };
    case "disable":
      return { status: current.status === "error" ? "error" : "disabled", enabled: false };
    case "fail":
      return { status: "error", enabled: false };
    case "clearError":
      if (current.status !== "error") return current;
      return { status: "installed", enabled: false }; // recovered but left off until re-enabled
    case "uninstall":
      return { status: current.status, enabled: false, removed: true };
    default:
      throw new PluginLifecycleError(`unknown action: ${action as string}`);
  }
}

/** True when a plugin is allowed to run: installed, enabled, not errored, not removed. */
export function isPluginEffective(state: PluginLifecycleState): boolean {
  return !state.removed && state.enabled && state.status === "installed";
}

// ── Runtime capability grants (#103) ──────────────────────────────────────────

export interface CapabilityGrantResult {
  granted: PluginCapability[];
  /** Declared-but-unknown capability strings (rejected at manifest validation, surfaced here too). */
  unknown: string[];
}

/**
 * Resolve which declared capabilities are actually granted. A grant cannot exceed what the manifest
 * declares (least privilege): the granted set is the intersection of `declared` and `approved`, minus
 * anything not a real capability. When `approved` is omitted, nothing is granted (deny-by-default).
 */
export function resolveGrantedCapabilities(
  declared: readonly string[],
  approved?: readonly string[],
): CapabilityGrantResult {
  const unknown = declared.filter((c) => !isPluginCapability(c));
  const declaredValid = declared.filter(isPluginCapability);
  const approvedSet = new Set(approved ?? []);
  const granted = declaredValid.filter((c) => approvedSet.has(c));
  return { granted, unknown };
}

/**
 * Guard a runtime capability request. Throws unless `capability` is in the granted set. The dispatcher
 * calls this before letting a plugin perform a capability-gated action.
 */
export function requirePluginCapability(
  granted: readonly string[],
  capability: PluginCapability,
): void {
  if (!granted.includes(capability))
    throw new PluginLifecycleError(`plugin lacks the '${capability}' capability`);
}
