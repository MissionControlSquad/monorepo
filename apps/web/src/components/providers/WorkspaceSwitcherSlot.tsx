"use client";

import { WorkspaceSwitcher } from "@buildbase/sdk/react";
import { useBuildbaseReady } from "./BuildbaseProvider";
import { Button } from "@/components/ui";

/**
 * Renders the buildbase WorkspaceSwitcher only when buildbase is configured (Epic #1, D3 —
 * humans switch between the workspaces they belong to). When buildbase is not configured the
 * app runs on the single default workspace, so this renders nothing.
 */
export function WorkspaceSwitcherSlot() {
  const ready = useBuildbaseReady();
  if (!ready) return null;

  return (
    <WorkspaceSwitcher
      trigger={(isLoading, currentWorkspace) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Switch workspace"
          className="max-w-[160px] truncate text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          {isLoading ? "…" : (currentWorkspace?.name ?? "Workspace")}
        </Button>
      )}
    />
  );
}
