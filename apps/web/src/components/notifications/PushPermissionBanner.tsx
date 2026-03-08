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
    <div className="mx-4 mt-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center gap-3">
      <Bell className="w-4 h-4 text-indigo-600 shrink-0" />
      <p className="text-sm text-indigo-800 flex-1">
        Enable push notifications to get updates when tasks complete or need review.
      </p>
      <button
        onClick={handleEnable}
        disabled={loading}
        className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-md disabled:opacity-50"
      >
        {loading ? "..." : "Enable"}
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-indigo-400 hover:text-indigo-600"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
