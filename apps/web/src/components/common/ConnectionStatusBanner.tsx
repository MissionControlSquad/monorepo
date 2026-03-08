"use client";

import { useState, useEffect } from "react";
import { onConnectionChange } from "../../lib/graphql/client";
import { WifiOff } from "lucide-react";

export function ConnectionStatusBanner() {
  const [connected, setConnected] = useState(true);

  useEffect(() => onConnectionChange(setConnected), []);

  if (connected) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[200] flex items-center justify-center gap-2 py-1.5 px-4 bg-warning text-warning-foreground text-xs font-medium shadow-md">
      <WifiOff className="w-3.5 h-3.5" />
      Connection lost — reconnecting…
    </div>
  );
}
