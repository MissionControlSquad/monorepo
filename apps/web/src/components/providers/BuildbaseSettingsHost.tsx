"use client";

import { WorkspaceSwitcher } from "@buildbase/sdk/react";
import { useBuildbaseReady } from "./BuildbaseProvider";

/**
 * Invisible host that mounts the buildbase WorkspaceSwitcher purely to bring its settings-dialog
 * infrastructure into the React tree.
 *
 * WHY: openWorkspaceSettings() / openCreditStore() / openPlanPicker() (called from the account menu)
 * only set state on the SDK's settings manager — the modal is rendered by a component hosted INSIDE
 * WorkspaceSwitcher. The SDK exports no standalone settings-dialog component, so if WorkspaceSwitcher
 * is not mounted anywhere, those calls succeed silently but NO modal appears.
 *
 * We don't want a visible workspace switcher (each tenant dashboard is pinned to one workspace), so
 * the trigger is hidden via a `display:none` wrapper. The settings dialog itself portals to
 * #saas-os-portal (a separate DOM node), so hiding this wrapper does NOT hide the opened modal.
 */
export function BuildbaseSettingsHost() {
  const ready = useBuildbaseReady();
  // WorkspaceSwitcher requires the SaaSOSProvider, which only mounts when buildbase is configured.
  if (!ready) return null;
  return (
    <div className="hidden" aria-hidden>
      <WorkspaceSwitcher trigger={() => <span />} />
    </div>
  );
}
