"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff, Info } from "lucide-react";
import { usePushNotifications } from "@buildbase/sdk/react";
import { FLAG_KEYS } from "@agentcenter/utils";
import { useFeatureFlag } from "@/components/context/FeatureFlagContext";
import { useBuildbaseReady } from "@/components/providers/BuildbaseProvider";
import { Card, Badge, Tooltip, Spinner } from "@/components/ui";
import { resolvePushCardStatus } from "./push-card-state";

// "Push notifications" settings section. Web push is delivered by buildbase: the SDK's
// PushNotificationProvider (mounted in BuildbaseProvider) owns the service worker + subscription,
// and this card drives it via usePushNotifications. Per-device: a push subscription belongs to the
// browser/device the user toggles it on, so the toggle reflects THIS device only.
//
// Gracefully degrades instead of crashing:
//   • buildbase unconfigured (no NEXT_PUBLIC_SAAS_ORG_ID) → the SDK provider isn't mounted, so we
//     must NOT call usePushNotifications; we render a disabled, explained card instead.
//   • NOTIFICATIONS feature flag off → disabled, explained card.

const WHAT_PUSH_DELIVERS =
  "Push sends important alerts (task updates, approvals, mentions) to this device even when " +
  "AgentCenter isn't open in a tab. Your in-app notification feed is unaffected either way.";

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
          <Bell className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            Push notifications
            <Tooltip side="bottom" content={WHAT_PUSH_DELIVERS}>
              <Info
                className="h-3.5 w-3.5 text-muted-foreground"
                aria-label="What do push notifications deliver?"
              />
            </Tooltip>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Get alerts on this device even when AgentCenter is closed. Delivered by buildbase; the
            browser must grant notification permission.
          </p>
        </div>
      </div>
      {children}
    </Card>
  );
}

/** Non-interactive explanation shown when push can't be used yet (flag off / unconfigured). */
function DisabledState({ reason }: { reason: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-dashed border-border p-3">
      <p className="text-sm text-muted-foreground">{reason}</p>
      <Badge variant="gray" dot>
        Unavailable
      </Badge>
    </div>
  );
}

/** Accessible on/off switch (native button → Space/Enter + focus ring for free). */
function Toggle({
  checked,
  disabled,
  onToggle,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-primary" : "bg-input"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function PermissionBadge({ permission }: { permission: NotificationPermission }) {
  if (permission === "granted")
    return (
      <Badge variant="green" dot>
        Permission granted
      </Badge>
    );
  if (permission === "denied")
    return (
      <Badge variant="red" dot>
        Permission blocked
      </Badge>
    );
  return (
    <Badge variant="yellow" dot>
      Permission not requested
    </Badge>
  );
}

/** Interactive body — only mounted when the SDK PushNotificationProvider is present. */
function ActiveState() {
  const { permission, isSubscribed, isSupported, loading, error, subscribe, unsubscribe } =
    usePushNotifications();
  const [busy, setBusy] = useState(false);

  if (!isSupported) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
        <BellOff className="h-4 w-4 flex-shrink-0" />
        This browser doesn&apos;t support web push notifications.
      </div>
    );
  }

  const permissionBlocked = permission === "denied";

  async function onToggle() {
    if (busy || loading) return;
    setBusy(true);
    try {
      if (isSubscribed) {
        await unsubscribe();
        toast.success("Push notifications turned off for this device");
      } else {
        await subscribe();
        // subscribe() requests permission if needed; a denial surfaces via `error`/`permission`.
        toast.success("Push notifications turned on for this device");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update push notifications");
    } finally {
      setBusy(false);
    }
  }

  const working = busy || loading;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Enable on this device</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Subscriptions are per-device — turn this on for each browser you want alerts on.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {working && <Spinner />}
          <Tooltip
            side="bottom"
            content={
              permissionBlocked
                ? "Notifications are blocked in your browser settings. Re-allow them for this site, then try again."
                : isSubscribed
                  ? "Stop receiving push notifications on this device."
                  : "Allow the browser to send push notifications to this device."
            }
          >
            <span className="inline-flex">
              <Toggle
                checked={isSubscribed}
                disabled={working || permissionBlocked}
                onToggle={onToggle}
                label={isSubscribed ? "Disable push on this device" : "Enable push on this device"}
              />
            </span>
          </Tooltip>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PermissionBadge permission={permission} />
        {isSubscribed ? (
          <Badge variant="green">This device is subscribed</Badge>
        ) : (
          <Badge variant="gray">This device is not subscribed</Badge>
        )}
      </div>

      {permissionBlocked && (
        <div className="flex items-start gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Your browser is blocking notifications for this site. Open the site permissions and set
            notifications to &ldquo;Allow&rdquo;, then reload to enable push here.
          </span>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function PushNotificationsCard() {
  const notificationsEnabled = useFeatureFlag(FLAG_KEYS.NOTIFICATIONS);
  const ready = useBuildbaseReady();
  const status = resolvePushCardStatus(notificationsEnabled, ready);

  return (
    <CardShell>
      {status === "flag-off" && (
        <DisabledState reason="Notifications are turned off for this workspace. Enable the Notifications feature to use push." />
      )}
      {status === "unconfigured" && (
        <DisabledState reason="Push notifications require buildbase to be configured. Once your organization is provisioned, you can subscribe this device here." />
      )}
      {status === "active" && <ActiveState />}
    </CardShell>
  );
}
