"use client";

import { memo } from "react";
import { usePathname } from "next/navigation";
import { Activity, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { GlobalSearch } from "./GlobalSearch";
import { Button } from "../ui";
import { NotificationBell } from "../notifications/NotificationBell";
import { WhenFeatureEnabled } from "../context/FeatureFlagContext";
import { FLAG_KEYS } from "@agentcenter/utils";

interface HeaderProps {
  onToggleActivity: () => void;
  activityOpen: boolean;
  onToggleSidebar: () => void;
  onToggleSidebarCollapse?: () => void;
  sidebarCollapsed?: boolean;
}

export const Header = memo(function Header({
  onToggleActivity,
  activityOpen,
  onToggleSidebar,
  onToggleSidebarCollapse,
  sidebarCollapsed,
}: HeaderProps) {
  const pathname = usePathname();
  const isHome = pathname === "/" || pathname === "/recurring-tasks";

  return (
    <header className="bg-background border-b border-border px-3 py-2 sm:px-4">
      <div className="flex items-center gap-3">
        {/* Mobile sidebar toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className="lg:hidden text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <Menu className="w-5 h-5" />
        </Button>

        {/* Desktop sidebar collapse toggle */}
        {onToggleSidebarCollapse && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleSidebarCollapse}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden lg:flex text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </Button>
        )}

        {/* Search — only on home/dashboard */}
        <div className="flex-1 flex justify-end sm:justify-start px-2">
          {isHome && <GlobalSearch />}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1 shrink-0">
          <WhenFeatureEnabled flag={FLAG_KEYS.NOTIFICATIONS}>
            <NotificationBell />
          </WhenFeatureEnabled>
          {isHome && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleActivity}
              aria-label="Toggle activity feed"
              className={
                activityOpen
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }
            >
              <Activity className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
});
