"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface SupportContextValue {
  isBugReportOpen: boolean;
  isFeatureRequestOpen: boolean;
  isLiveChatOpen: boolean;
  openBugReport: () => void;
  openFeatureRequest: () => void;
  closeBugReport: () => void;
  closeFeatureRequest: () => void;
  openLiveChat: () => void;
  closeLiveChat: () => void;
}

const SupportContext = createContext<SupportContextValue | null>(null);

type HubSpotWin = Window & {
  HubSpotConversations?: {
    widget: {
      load(opts?: { widgetOpen?: boolean }): void;
      status(): { loaded: boolean };
    };
  };
  hsConversationsOnReady?: Array<() => void>;
};

export function SupportContextProvider({ children }: { children: React.ReactNode }) {
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  const [isFeatureRequestOpen, setIsFeatureRequestOpen] = useState(false);
  const [isLiveChatOpen, setIsLiveChatOpen] = useState(false);

  const openBugReport = useCallback(() => setIsBugReportOpen(true), []);
  const closeBugReport = useCallback(() => setIsBugReportOpen(false), []);
  const openFeatureRequest = useCallback(() => setIsFeatureRequestOpen(true), []);
  const closeFeatureRequest = useCallback(() => setIsFeatureRequestOpen(false), []);
  const closeLiveChat = useCallback(() => setIsLiveChatOpen(false), []);

  const openLiveChat = useCallback(() => {
    if (typeof window === "undefined") return;
    setIsLiveChatOpen(true);

    // #hs-chat-inline is always in the DOM (LiveChatOverlay renders it unconditionally).
    // Call widget.load() to inject the iframe if not already done.
    const doLoad = () => {
      const widget = (window as HubSpotWin).HubSpotConversations?.widget;
      if (!widget) return;
      if (!widget.status().loaded) {
        widget.load();
      }
    };

    const win = window as HubSpotWin;
    if (win.HubSpotConversations) {
      doLoad();
    } else {
      win.hsConversationsOnReady = win.hsConversationsOnReady ?? [];
      win.hsConversationsOnReady.push(doLoad);
    }
  }, []);

  return (
    <SupportContext.Provider
      value={{
        isBugReportOpen,
        isFeatureRequestOpen,
        isLiveChatOpen,
        openBugReport,
        openFeatureRequest,
        closeBugReport,
        closeFeatureRequest,
        openLiveChat,
        closeLiveChat,
      }}
    >
      {children}
    </SupportContext.Provider>
  );
}

export function useSupportContext() {
  const ctx = useContext(SupportContext);
  if (!ctx) throw new Error("useSupportContext must be used within SupportContextProvider");
  return ctx;
}
