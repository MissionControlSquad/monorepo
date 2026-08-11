"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Tooltip } from "@/components/ui";
import {
  hostContext,
  hostActionResult,
  isTrustedSlotOrigin,
  parsePluginToHost,
  type PluginSlotContext,
} from "@agentcenter/utils";

// PluginSlot (§3 plugins) — renders a plugin-provided UI fragment into a named slot inside a SANDBOXED
// iframe and speaks the typed postMessage bridge (@agentcenter/utils/plugin-ui-protocol).
//
// SECURITY POSTURE (why this is safe to render third-party UI):
//   • sandbox="allow-scripts" ONLY — deliberately NO allow-same-origin. The frame therefore runs with an
//     opaque origin ("null"): it cannot touch the host DOM, cookies, localStorage, or same-site network.
//   • Every inbound message is double-gated before we trust it:
//        1. identity — event.source === iframe.contentWindow (rejects messages from any other frame);
//        2. origin   — isTrustedSlotOrigin(event.origin) (the opaque "null" for a sandboxed frame).
//     Only then is the payload parsed into a closed union (parsePluginToHost). Unknowns are dropped.
//   • Host→plugin only ever sends NON-sensitive context (slot, ids, theme). No secrets cross the bridge.
//   • Resize is clamped (MAX_HEIGHT) so a plugin cannot grow the frame without bound.

const MAX_HEIGHT = 2000;
const MIN_HEIGHT = 80;

export interface PluginSlotProps {
  pluginId: string;
  slot: string;
  /** The iframe src (manifest ui[].entry) — a same-origin path or https URL. */
  entry: string;
  title?: string;
  workspaceId?: string;
  /** Optional host action handler — return a result the plugin receives (host:action-result). */
  onAction?: (action: string, payload: unknown) => Promise<unknown> | unknown;
  /** Additional allowed origins beyond the opaque sandbox origin (for non-sandboxed same-origin dev). */
  allowedOrigins?: string[];
  className?: string;
  /** Test seam: observe the last plugin→host message the bridge accepted. */
  onMessage?: (type: string) => void;
}

export function PluginSlot({
  pluginId,
  slot,
  entry,
  title,
  workspaceId = "",
  onAction,
  allowedOrigins = [],
  className,
  onMessage,
}: PluginSlotProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function theme(): "light" | "dark" {
      if (typeof window === "undefined") return "light";
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    function post(win: Window, msg: unknown) {
      // targetOrigin "*" is acceptable here ONLY because a sandboxed frame has an opaque origin (there is
      // no concrete origin to pin), and we send non-sensitive context. Never send secrets this way.
      win.postMessage(msg, "*");
    }

    async function onWindowMessage(event: MessageEvent) {
      const frame = iframeRef.current;
      // GATE 1 — identity: must originate from OUR iframe's window, nothing else on the page.
      if (!frame || event.source !== frame.contentWindow) return;
      // GATE 2 — origin: opaque "null" for the sandbox (or an explicitly allowed origin).
      if (!isTrustedSlotOrigin(event.origin, allowedOrigins)) return;

      const msg = parsePluginToHost(event.data);
      if (!msg) return;
      onMessage?.(msg.type);

      const target = frame.contentWindow;
      if (!target) return;

      switch (msg.type) {
        case "plugin:ready": {
          setReady(true);
          const context: PluginSlotContext = {
            slot,
            pluginId,
            workspaceId,
            theme: theme(),
            locale: typeof navigator !== "undefined" ? navigator.language : undefined,
          };
          post(target, hostContext(context));
          break;
        }
        case "plugin:resize": {
          setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.ceil(msg.height))));
          break;
        }
        case "plugin:action-request": {
          try {
            const result = onAction ? await onAction(msg.action, msg.payload) : undefined;
            post(target, hostActionResult(msg.requestId, true, { result }));
          } catch (err) {
            post(
              target,
              hostActionResult(msg.requestId, false, {
                error: err instanceof Error ? err.message : "action failed",
              }),
            );
          }
          break;
        }
      }
    }

    window.addEventListener("message", onWindowMessage);
    return () => window.removeEventListener("message", onWindowMessage);
  }, [pluginId, slot, workspaceId, onAction, allowedOrigins, onMessage]);

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Tooltip content="This fragment runs in a sandboxed iframe (allow-scripts only, opaque origin). It cannot read the host page, cookies, or storage, and only exchanges typed postMessage frames.">
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            <ShieldCheck className="h-3 w-3" /> sandboxed
          </span>
        </Tooltip>
        {!ready && <span className="text-[11px] text-muted-foreground">connecting…</span>}
      </div>
      <iframe
        ref={iframeRef}
        // SECURITY: allow-scripts ONLY. Do NOT add allow-same-origin — it would give the frame the
        // host's origin and defeat the isolation the whole bridge relies on.
        sandbox="allow-scripts"
        src={entry}
        title={title ?? `${pluginId} — ${slot}`}
        height={height}
        className="w-full rounded-lg border border-border bg-background"
        style={{ height }}
      />
    </div>
  );
}
