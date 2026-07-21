"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { API_ROUTES } from "@/lib/api-routes";
import { Card, Button } from "@/components/ui";

// Paperclip parity: a UI for the per-user notification preferences (model + REST route already exist;
// there was no settings surface). Reads/writes /api/user-notifications/preferences.
type Prefs = Record<string, boolean | string | null>;

const TYPE_FIELDS: { key: string; label: string }[] = [
  { key: "taskAssigned", label: "Task assigned to me" },
  { key: "taskNeedsReview", label: "Task needs my review" },
  { key: "taskClarificationRequested", label: "Clarification requested" },
  { key: "taskApproved", label: "Task approved" },
  { key: "taskRejected", label: "Task rejected" },
  { key: "taskDone", label: "Task completed" },
  { key: "deliverableSubmitted", label: "Deliverable submitted" },
  { key: "documentAdded", label: "Document added" },
  { key: "mention", label: "Mentions" },
  { key: "newComment", label: "New comment" },
  { key: "teamUpdate", label: "Team updates" },
];
const CHANNEL_FIELDS: { key: string; label: string }[] = [
  { key: "inAppEnabled", label: "In-app" },
  { key: "pushEnabled", label: "Push" },
  { key: "emailEnabled", label: "Email" },
];

export function NotificationPreferencesCard() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(API_ROUTES.userNotifications.preferences)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPrefs(data ?? {}))
      .catch(() => setPrefs({}));
  }, []);

  function toggle(key: string) {
    setPrefs((p) => (p ? { ...p, [key]: !p[key] } : p));
  }

  async function onSave() {
    if (!prefs) return;
    setSaving(true);
    try {
      const res = await fetch(API_ROUTES.userNotifications.preferences, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) {
        toast.error("Failed to save preferences");
        return;
      }
      toast.success("Notification preferences saved");
    } finally {
      setSaving(false);
    }
  }

  const row = (key: string, label: string) => (
    <label key={key} className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-foreground">{label}</span>
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={Boolean(prefs?.[key])}
        disabled={!prefs || saving}
        onChange={() => toggle(key)}
      />
    </label>
  );

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
          <Bell className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Notifications</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which events notify you, and where.
          </p>
        </div>
      </div>

      {!prefs ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Channels
            </p>
            <div className="divide-y divide-border">
              {CHANNEL_FIELDS.map((f) => row(f.key, f.label))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Notify me about
            </p>
            <div className="divide-y divide-border">
              {TYPE_FIELDS.map((f) => row(f.key, f.label))}
            </div>
          </div>
          <div className="flex justify-end border-t border-border pt-3">
            <Button size="sm" disabled={saving} onClick={onSave}>
              Save preferences
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
