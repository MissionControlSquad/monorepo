"use client";

import { useState, useEffect, useCallback } from "react";
import { usePushNotifications } from "../../hooks/usePushNotifications";

interface Prefs {
  taskDone: boolean;
  taskNeedsReview: boolean;
  taskClarificationRequested: boolean;
  taskApproved: boolean;
  taskRejected: boolean;
  newComment: boolean;
  mention: boolean;
  deliverableSubmitted: boolean;
  taskAssigned: boolean;
  teamUpdate: boolean;
  documentAdded: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
}

const TYPE_LABELS: { key: keyof Prefs; label: string }[] = [
  { key: "taskDone", label: "Task completed" },
  { key: "taskNeedsReview", label: "Task needs review" },
  { key: "taskClarificationRequested", label: "Clarification requested" },
  { key: "taskApproved", label: "Task approved" },
  { key: "taskRejected", label: "Task rejected" },
  { key: "newComment", label: "New comments" },
  { key: "mention", label: "Mentions" },
  { key: "deliverableSubmitted", label: "Deliverable submitted" },
  { key: "taskAssigned", label: "Task assigned" },
  { key: "teamUpdate", label: "Team updates" },
  { key: "documentAdded", label: "Document added" },
];

const CHANNEL_LABELS: { key: keyof Prefs; label: string }[] = [
  { key: "inAppEnabled", label: "In-app notifications" },
  { key: "pushEnabled", label: "Push notifications" },
  { key: "emailEnabled", label: "Email notifications" },
];

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const { isSupported, permission, subscribe } = usePushNotifications();

  useEffect(() => {
    fetch("/api/user-notifications/preferences")
      .then((r) => r.json())
      .then(setPrefs)
      .catch((err) => console.error("[prefs] Failed to load notification preferences:", err));
  }, []);

  const toggle = useCallback(
    async (key: keyof Prefs) => {
      if (!prefs) return;
      const updated = { ...prefs, [key]: !prefs[key] };
      setPrefs(updated);
      setSaving(true);

      // If enabling push and not yet granted, request permission
      if (key === "pushEnabled" && !prefs.pushEnabled && isSupported && permission !== "granted") {
        await subscribe();
      }

      await fetch("/api/user-notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: updated[key] }),
      }).catch((err) => console.error("[prefs] Failed to save notification preference:", err));
      setSaving(false);
    },
    [prefs, isSupported, permission, subscribe],
  );

  if (!prefs) {
    return <div className="text-sm text-muted-foreground py-4">Loading preferences...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Channels</h3>
        <div className="space-y-2">
          {CHANNEL_LABELS.map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between py-1">
              <span className="text-sm text-foreground">{label}</span>
              <button
                onClick={() => toggle(key)}
                disabled={saving}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  prefs[key] ? "bg-primary" : "bg-muted-foreground/40"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    prefs[key] ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Notification types</h3>
        <div className="space-y-2">
          {TYPE_LABELS.map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between py-1">
              <span className="text-sm text-foreground">{label}</span>
              <button
                onClick={() => toggle(key)}
                disabled={saving}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  prefs[key] ? "bg-primary" : "bg-muted-foreground/40"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    prefs[key] ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
