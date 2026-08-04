"use client";

import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { Header } from "./Header";
import { IconRail } from "./sidebar/IconRail";
import { CommandPalette } from "./CommandPalette";
import { ActivityDrawer } from "./ActivityDrawer";
import { ProfileSidebar } from "./ProfileSidebar";
import { useProfileSidebar } from "../context/ProfileSidebarContext";
import { useAgentDetail } from "../context/AgentDetailContext";
import { useProjectDetail } from "../context/ProjectDetailContext";
import { AgentDetailDialog } from "../agent/AgentDetailDialog";
import { ProjectDetailDialog } from "../project/ProjectDetailDialog";
import { ErrorBoundary, PanelErrorFallback } from "../common/ErrorBoundary";
import { useTaskNavigation } from "../../hooks/useTaskNavigation";
import { useAgentStatus } from "../context/AgentStatusContext";
import { useOnboarding } from "../../hooks/useOnboarding";
import type { Agent } from "@agentcenter/types";
import { Button } from "../ui";
import { KeyboardShortcutsOverlay } from "../common/KeyboardShortcutsOverlay";
import { useGoShortcuts } from "../../hooks/useGoShortcuts";
import { SetupStatus } from "@/server/constants";
import { SupportContextProvider, useSupportContext } from "../support/SupportContext";
import { HubSpotScript } from "../support/HubSpotScript";
import { LiveChatOverlay } from "../support/LiveChatOverlay";
const BugReportModal = lazy(() =>
  import("../support/BugReportModal").then((m) => ({ default: m.BugReportModal })),
);
const FeatureRequestModal = lazy(() =>
  import("../support/FeatureRequestModal").then((m) => ({ default: m.FeatureRequestModal })),
);
const CreateTaskModal = lazy(() =>
  import("../task/CreateTaskModal").then((m) => ({ default: m.CreateTaskModal })),
);

interface AppShellProps {
  children: React.ReactNode;
  modal?: React.ReactNode;
}

export function AppShell({ children, modal }: AppShellProps) {
  const openTask = useTaskNavigation();
  const { agents } = useAgentStatus();
  useGoShortcuts();

  const { loading, needsOnboarding } = useOnboarding(agents);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "true";
  });
  const { closeProfile: handleCloseProfile } = useProfileSidebar();
  const { openAgentId, closeAgent } = useAgentDetail();
  const { openProjectId, closeProject } = useProjectDetail();

  const pathname = usePathname();

  useEffect(() => setMounted(true), []);

  // Push service worker is now owned by buildbase (registers public/push-sw.js via its own
  // usePushNotifications hook inside the notifications settings screen). Our VAPID SW is removed.

  // Lock body scroll when activity sheet is open
  useEffect(() => {
    if (activityOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [activityOpen]);

  // Close mobile overlay on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleNotificationClick = useCallback(
    (taskId: string) => {
      openTask(taskId);
    },
    [openTask],
  );

  const handleOpenCreateTask = useCallback(() => {
    setIsCreateTaskOpen(true);
  }, []);

  const handleCloseCreateTask = useCallback(() => {
    setIsCreateTaskOpen(false);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setMobileOpen((v) => !v);
  }, []);

  const handleToggleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed((v) => {
      const next = !v;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setMobileOpen(false);
  }, []);

  const handleToggleActivity = useCallback(() => {
    setActivityOpen((v) => !v);
  }, []);

  const handleCloseActivity = useCallback(() => {
    setActivityOpen(false);
  }, []);

  // ── Early returns (all hooks are above) ──

  if (loading || needsOnboarding) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show a "waiting" banner when all agents are pending_setup (none active yet)
  const hasActiveAgent = agents!.some((a: Agent) => a.setupStatus === SetupStatus.ACTIVE);
  const hasPendingAgent = agents!.some((a: Agent) => a.setupStatus === SetupStatus.PENDING_SETUP);
  const showWaitingBanner = hasPendingAgent && !hasActiveAgent;

  const isOnboarding = pathname === "/onboarding";

  return (
    <SupportContextProvider>
      {/* Global Cmd/Ctrl-K quick switcher */}
      {!isOnboarding && <CommandPalette onCreateTask={handleOpenCreateTask} />}
      <div
        className="flex bg-muted"
        style={{
          marginTop: "var(--electron-titlebar-height, 0px)",
          height: "calc(100dvh - var(--electron-titlebar-height, 0px))",
        }}
      >
        {/* Sidebar backdrop (mobile) */}
        {mobileOpen && !isOnboarding && (
          <div
            className="fixed inset-x-0 bottom-0 top-titlebar bg-black/30 z-40 lg:hidden"
            onClick={handleCloseSidebar}
          />
        )}

        {/* Icon rail — hidden during onboarding */}
        {!isOnboarding && (
          <aside
            className={`
            fixed bottom-0 top-titlebar left-0 z-50
            transition-all duration-200 ease-out
            lg:static lg:z-50 lg:shrink-0
            ${sidebarCollapsed ? "lg:-translate-x-full lg:w-0 lg:overflow-hidden" : "lg:translate-x-0"}
            ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          `}
          >
            <ErrorBoundary
              fallback={({ resetErrorBoundary, error }) => (
                <PanelErrorFallback label="Sidebar" error={error} onRetry={resetErrorBoundary} />
              )}
            >
              <IconRail onCreateTask={handleOpenCreateTask} />
            </ErrorBoundary>
          </aside>
        )}

        {/* Main column: navbar + content */}
        <div className="flex-1 flex flex-col min-w-0">
          {(pathname === "/" || pathname === "/recurring-tasks") && (
            <Header
              onToggleActivity={handleToggleActivity}
              activityOpen={activityOpen}
              onToggleSidebar={handleToggleSidebar}
              onToggleSidebarCollapse={handleToggleSidebarCollapse}
              sidebarCollapsed={sidebarCollapsed}
            />
          )}

          <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
            {showWaitingBanner && (
              <div className="mx-4 mt-3 mb-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-lg flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Waiting for agents to connect&hellip;{" "}
                  <Link href="/agents" className="font-medium underline underline-offset-2">
                    View setup instructions
                  </Link>
                </p>
              </div>
            )}
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  Loading...
                </div>
              }
            >
              {children}
            </Suspense>
          </div>
        </div>

        {/* Activity feed — portal sheet */}
        {mounted && (
          <ActivityDrawer
            open={activityOpen}
            onClose={handleCloseActivity}
            onTaskClick={handleNotificationClick}
          />
        )}

        {modal}

        {/* Profile sidebar (mention click) */}
        <ProfileSidebar mounted={mounted} onClose={handleCloseProfile} />

        {/* Agent detail dialog (mention click) */}
        <AgentDetailDialog
          agentId={openAgentId}
          isOpen={!!openAgentId}
          onClose={closeAgent}
          onTaskClick={(taskId) => {
            closeAgent();
            openTask(taskId);
          }}
        />

        {/* Project detail dialog (mention click) */}
        <ProjectDetailDialog
          projectId={openProjectId}
          isOpen={!!openProjectId}
          onClose={closeProject}
          onTaskClick={(taskId) => {
            closeProject();
            openTask(taskId);
          }}
        />

        {/* Create Task Modal */}
        <ErrorBoundary
          fallback={({ resetErrorBoundary }) => (
            <div className="fixed inset-x-0 bottom-0 top-titlebar z-[60] flex items-center justify-center bg-black/30">
              <div className="bg-background rounded-xl shadow-xl p-6 max-w-sm mx-4 text-center">
                <p className="text-sm font-medium text-foreground mb-1">Failed to load</p>
                <p className="text-xs text-muted-foreground mb-4">
                  The dialog could not be loaded. Please try again.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetErrorBoundary}
                  className="text-blue-600 hover:text-blue-700"
                >
                  Retry
                </Button>
              </div>
            </div>
          )}
        >
          <Suspense fallback={null}>
            <CreateTaskModal isOpen={isCreateTaskOpen} onClose={handleCloseCreateTask} />
          </Suspense>
        </ErrorBoundary>

        {/* Support modals */}
        <SupportModals />

        <HubSpotScript />
        <KeyboardShortcutsOverlay />
        <Toaster position="bottom-right" richColors />
      </div>
    </SupportContextProvider>
  );
}

function SupportModals() {
  const { isBugReportOpen, isFeatureRequestOpen, closeBugReport, closeFeatureRequest } =
    useSupportContext();
  return (
    <>
      <LiveChatOverlay />
      <Suspense fallback={null}>
        <BugReportModal isOpen={isBugReportOpen} onClose={closeBugReport} />
      </Suspense>
      <Suspense fallback={null}>
        <FeatureRequestModal isOpen={isFeatureRequestOpen} onClose={closeFeatureRequest} />
      </Suspense>
    </>
  );
}
