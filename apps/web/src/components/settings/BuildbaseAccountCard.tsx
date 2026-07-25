"use client";

import { useSaaSAuth } from "@buildbase/sdk/react";
import { useBuildbaseReady } from "@/components/providers/BuildbaseProvider";
import { Button, Card } from "@/components/ui";

// Entry points into buildbase's INBUILT user-layer screens. We implement none of these pages —
// billing, quota, credits, notifications, members, permissions, devices, connected-agents are all
// ready-made dialogs the SDK renders; we just open them via openWorkspaceSettings(). See the
// AI-vs-user split in .paperclip-parity/BUILDBASE-PLAN.mdx. Dormant until BuildbaseReady.

// Section keys match the SDK's WorkspaceSettingsSection string union.
const SECTIONS: { section: string; label: string; hint: string }[] = [
  { section: "subscription", label: "Plan & billing", hint: "App subscription, invoices, seats" },
  { section: "usage", label: "Usage", hint: "Quota usage dashboard" },
  { section: "credits", label: "Credits", hint: "Prepaid credit balance & purchases" },
  { section: "notifications", label: "Notifications", hint: "Email & push preferences" },
  { section: "users", label: "Members", hint: "Workspace members & invites" },
  { section: "permissions", label: "Permissions", hint: "Roles & access" },
  { section: "devices", label: "Devices & sessions", hint: "Signed-in devices, revoke access" },
  { section: "connected-agents", label: "Connected agents", hint: "Authorized AI agents" },
];

function AccountCardInner() {
  const { openWorkspaceSettings } = useSaaSAuth();
  return (
    <Card padding="lg" className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Account &amp; billing</h2>
        <p className="text-sm text-muted-foreground">
          Managed by buildbase. Opens the built-in workspace screens.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {SECTIONS.map(({ section, label, hint }) => (
          <button
            key={section}
            type="button"
            onClick={() => openWorkspaceSettings(section as never)}
            className="flex flex-col items-start rounded-md border border-border p-3 text-left hover:bg-muted"
          >
            <span className="text-sm font-medium text-foreground">{label}</span>
            <span className="text-xs text-muted-foreground">{hint}</span>
          </button>
        ))}
      </div>
      <Button variant="secondary" size="sm" onClick={() => openWorkspaceSettings()}>
        Open workspace settings
      </Button>
    </Card>
  );
}

export function BuildbaseAccountCard() {
  const ready = useBuildbaseReady();
  // useSaaSAuth requires the provider, which only mounts when ready — guard by not rendering the
  // inner component otherwise.
  if (!ready) return null;
  return <AccountCardInner />;
}
