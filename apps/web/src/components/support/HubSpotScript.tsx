"use client";

import { useEffect } from "react";

/**
 * Dynamically loads the HubSpot chat widget script.
 * Reads the portal ID from window.__ENV__.HUBSPOT_PORTAL_ID (set by RuntimeEnvScript).
 *
 * loadImmediately: false → script loads in the background but the widget bubble
 * stays completely hidden until the user clicks "Live Chat".
 * At that point SupportContext calls widget.load({ widgetOpen: true }) which
 * initialises and opens the chat in one step — no bubble ever appears.
 */
export function HubSpotScript() {
  useEffect(() => {
    const win = window as Window & {
      __ENV__?: { HUBSPOT_PORTAL_ID?: string };
      hsConversationsSettings?: { loadImmediately: boolean; inlineEmbedSelector?: string };
    };

    const portalId = win.__ENV__?.HUBSPOT_PORTAL_ID;
    if (!portalId) return;

    // Inline embed: widget renders inside #hs-chat-inline (our full-screen overlay)
    // instead of as a floating bubble. loadImmediately:false means nothing renders
    // until the user clicks "Live Chat" and we call widget.load().
    win.hsConversationsSettings = {
      loadImmediately: false,
      inlineEmbedSelector: "#hs-chat-inline",
    };

    if (document.getElementById("hs-script-loader")) return;

    const script = document.createElement("script");
    script.id = "hs-script-loader";
    script.type = "text/javascript";
    script.async = true;
    script.defer = true;
    script.src = `https://js.hs-scripts.com/${portalId}.js`;
    document.body.appendChild(script);
  }, []);

  return null;
}
