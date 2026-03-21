"use client";

import { useState } from "react";
import { Bell, X } from "lucide-react";
import { usePushNotifications } from "../../hooks/usePushNotifications";

export function PushPermissionBanner() {
  const { isSupported, permission, subscribe } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isSupported || permission !== "default" || dismissed) return null;

  const handleEnable = async () => {
    setLoading(true);
    await subscribe();
    setLoading(false);
  };

  return (
    <div className="mx-4 mt-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-lg flex items-center gap-3">
      <Bell className="w-4 h-4 text-primary shrink-0" />
      <p className="text-sm text-foreground flex-1">
        Enable push notifications to get updates when tasks complete or need review.
      </p>
      <button
        onClick={handleEnable}
        disabled={loading}
        className="text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-md disabled:opacity-50"
      >
        {loading ? "..." : "Enable"}
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
