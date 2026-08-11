/**
 * Plugin UI extension-slot postMessage protocol (§3 plugins). A host renders a plugin-provided UI
 * fragment inside a SANDBOXED iframe (`sandbox="allow-scripts"`, no `allow-same-origin`) and speaks this
 * tiny, typed protocol over postMessage. Pure + framework-free so both the host component (PluginSlot)
 * and a plugin's entry page import the SAME guards — and so it is unit-testable with no DOM.
 *
 * SECURITY MODEL (why this is safe):
 *  • The iframe has NO same-origin privileges → its effective origin is the opaque string "null". It
 *    cannot read the host DOM, cookies, or storage; it can only postMessage.
 *  • The host NEVER trusts a message by shape alone. Two independent checks gate every inbound frame:
 *      1. identity  — event.source must be the iframe's own contentWindow (see PluginSlot);
 *      2. origin    — event.origin must be an allowed origin (isTrustedSlotOrigin) — for a sandboxed
 *         opaque frame that is the literal "null".
 *  • Only after both pass do we `parsePluginToHost` the payload into a closed union. Anything else is
 *    dropped silently. The host→plugin direction only ever sends non-sensitive context.
 */

/** Wire protocol version. Bumped if the message shapes change incompatibly. */
export const PLUGIN_UI_PROTOCOL_VERSION = 1 as const;

/** The opaque origin a `sandbox="allow-scripts"` (no allow-same-origin) iframe reports. */
export const OPAQUE_ORIGIN = "null" as const;

// ── Host → plugin ────────────────────────────────────────────────────────────────────────────────
/** Context the host hands the plugin once the frame signals ready. Deliberately non-sensitive. */
export interface PluginSlotContext {
  slot: string;
  pluginId: string;
  workspaceId: string;
  /** Preferred color scheme so the fragment can theme itself. */
  theme?: "light" | "dark";
  locale?: string;
}
export interface HostContextMessage {
  type: "host:context";
  version: typeof PLUGIN_UI_PROTOCOL_VERSION;
  context: PluginSlotContext;
}
/** Host's reply to a plugin action-request (correlated by requestId). */
export interface HostActionResultMessage {
  type: "host:action-result";
  version: typeof PLUGIN_UI_PROTOCOL_VERSION;
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}
export type HostToPluginMessage = HostContextMessage | HostActionResultMessage;

// ── Plugin → host ────────────────────────────────────────────────────────────────────────────────
/** Frame is loaded and listening — the host answers with host:context. */
export interface PluginReadyMessage {
  type: "plugin:ready";
  version: typeof PLUGIN_UI_PROTOCOL_VERSION;
}
/** Ask the host to resize the iframe to fit content (host clamps to a max). */
export interface PluginResizeMessage {
  type: "plugin:resize";
  version: typeof PLUGIN_UI_PROTOCOL_VERSION;
  height: number;
}
/** Ask the host to perform a named action on the plugin's behalf (host decides whether to honor it). */
export interface PluginActionRequestMessage {
  type: "plugin:action-request";
  version: typeof PLUGIN_UI_PROTOCOL_VERSION;
  requestId: string;
  action: string;
  payload?: unknown;
}
export type PluginToHostMessage =
  | PluginReadyMessage
  | PluginResizeMessage
  | PluginActionRequestMessage;

/**
 * Origin check for a slot iframe message. A sandboxed (opaque) frame reports "null"; if the host chose
 * to load the entry with same-origin privileges it would report its real origin. Accept the opaque
 * origin OR any explicitly-allowed origin. Everything else is rejected — never trust `*`.
 */
export function isTrustedSlotOrigin(origin: string, allowedOrigins: string[] = []): boolean {
  if (origin === OPAQUE_ORIGIN) return true;
  return allowedOrigins.includes(origin);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isVersion(v: unknown): v is typeof PLUGIN_UI_PROTOCOL_VERSION {
  return v === PLUGIN_UI_PROTOCOL_VERSION;
}

/**
 * Parse an untrusted inbound frame from the plugin into a typed message, or null if it is malformed / an
 * unknown type / a wrong protocol version. The host calls this ONLY after the identity + origin checks
 * pass. Never throws.
 */
export function parsePluginToHost(data: unknown): PluginToHostMessage | null {
  if (!isRecord(data) || !isVersion(data.version)) return null;
  switch (data.type) {
    case "plugin:ready":
      return { type: "plugin:ready", version: PLUGIN_UI_PROTOCOL_VERSION };
    case "plugin:resize": {
      const h = data.height;
      if (typeof h !== "number" || !Number.isFinite(h) || h <= 0) return null;
      return { type: "plugin:resize", version: PLUGIN_UI_PROTOCOL_VERSION, height: h };
    }
    case "plugin:action-request": {
      if (typeof data.requestId !== "string" || !data.requestId) return null;
      if (typeof data.action !== "string" || !data.action) return null;
      return {
        type: "plugin:action-request",
        version: PLUGIN_UI_PROTOCOL_VERSION,
        requestId: data.requestId,
        action: data.action,
        payload: data.payload,
      };
    }
    default:
      return null;
  }
}

/** Parse an untrusted inbound frame from the host (plugin side of the bridge). Symmetry helper. */
export function parseHostToPlugin(data: unknown): HostToPluginMessage | null {
  if (!isRecord(data) || !isVersion(data.version)) return null;
  if (data.type === "host:context" && isRecord(data.context)) {
    const c = data.context;
    if (typeof c.slot !== "string" || typeof c.pluginId !== "string") return null;
    if (typeof c.workspaceId !== "string") return null;
    return { type: "host:context", version: PLUGIN_UI_PROTOCOL_VERSION, context: c as unknown as PluginSlotContext };
  }
  if (data.type === "host:action-result" && typeof data.requestId === "string") {
    return {
      type: "host:action-result",
      version: PLUGIN_UI_PROTOCOL_VERSION,
      requestId: data.requestId,
      ok: data.ok === true,
      result: data.result,
      error: typeof data.error === "string" ? data.error : undefined,
    };
  }
  return null;
}

/** Builders (typed, so callers can't drift the wire shape). */
export function hostContext(context: PluginSlotContext): HostContextMessage {
  return { type: "host:context", version: PLUGIN_UI_PROTOCOL_VERSION, context };
}
export function hostActionResult(
  requestId: string,
  ok: boolean,
  extra: { result?: unknown; error?: string } = {},
): HostActionResultMessage {
  return { type: "host:action-result", version: PLUGIN_UI_PROTOCOL_VERSION, requestId, ...extra, ok };
}
