"use client";

import { X } from "lucide-react";
import { useSupportContext } from "./SupportContext";

/**
 * Slide-in chat sidebar from the right edge.
 *
 * The #hs-chat-inline div is always in the DOM so HubSpot's inlineEmbedSelector
 * can find it as soon as widget.load() is called.  Visibility is controlled via
 * translate + visibility so the iframe stays alive between open/close cycles.
 */
export function LiveChatOverlay() {
  const { isLiveChatOpen, closeLiveChat } = useSupportContext();

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={closeLiveChat}
        className="fixed inset-0 z-[9998] bg-black/30 transition-opacity duration-300"
        style={
          isLiveChatOpen
            ? { opacity: 1, pointerEvents: "auto" }
            : { opacity: 0, pointerEvents: "none", visibility: "hidden" }
        }
      />

      {/* Sidebar panel */}
      <div
        aria-hidden={!isLiveChatOpen}
        className="fixed top-0 right-0 bottom-0 z-[9999] flex flex-col bg-background shadow-2xl w-[420px] max-w-full transition-transform duration-300 ease-in-out"
        style={{
          transform: isLiveChatOpen ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-foreground">Live Chat</span>
          <button
            onClick={closeLiveChat}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close chat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* HubSpot injects the chat iframe here via inlineEmbedSelector */}
        <div id="hs-chat-inline" className="flex-1 min-h-0" />
      </div>
    </>
  );
}
