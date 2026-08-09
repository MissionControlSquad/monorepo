"use client";

import { useState, useEffect } from "react";
import { onConnectionChange } from "../../lib/graphql/client";
import { WifiOff } from "lucide-react";

// Height of the banner, shared between the fixed bar and the layout offset it reserves so the bar
// pushes the app down instead of covering the top navigation. Keep the class and the variable in sync.
const BANNER_HEIGHT = "1.75rem"; // h-7

export function ConnectionStatusBanner() {
  const [connected, setConnected] = useState(true);

  useEffect(() => onConnectionChange(setConnected), []);

  // Reserve layout space for the fixed bar while it is visible (AppShell reads this variable), so the
  // top navigation / search never end up hidden behind it. Cleared when reconnected.
  useEffect(() => {
    const root = document.documentElement;
    if (connected) root.style.removeProperty("--connection-banner-height");
    else root.style.setProperty("--connection-banner-height", BANNER_HEIGHT);
    return () => {
      root.style.removeProperty("--connection-banner-height");
    };
  }, [connected]);

  if (connected) return null;

  return (
    <div className="fixed inset-x-0 top-titlebar z-[200] flex h-7 items-center justify-center gap-2 px-4 bg-warning text-warning-foreground text-xs font-medium shadow-md">
      <WifiOff className="w-3.5 h-3.5" />
      Connection lost - reconnecting…
    </div>
  );
}
