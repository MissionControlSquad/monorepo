"use client";

import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { Header } from "./Header";
import { IconRail } from "./sidebar/IconRail";
import { ActivityFeed } from "./ActivityFeed";
import { ProfileSidebar } from "./ProfileSidebar";
import { useProfileSidebar } from "../context/ProfileSidebarContext";
import { useAgentDetail } from "../context/AgentDetailContext";
import { useProjectDetail } from "../context/ProjectDetailContext";
import { AgentDetailDialog } from "../agent/AgentDetailDialog";
import { ProjectDetailDialog } from "../project/ProjectDetailDialog";
import { OnboardingView } from "../onboarding/OnboardingView";
import { ErrorBoundary, PanelErrorFallback } from "../common/ErrorBoundary";
import { useTaskNavigation } from "../../hooks/useTaskNavigation";
import { useAgentStatus } from "../context/AgentStatusContext";
import type { Agent } from "../../lib/types";
import { Button } from "../ui";
import { PushPermissionBanner } from "../notifications/PushPermissionBanner";
import { WhenFeatureEnabled } from "../context/FeatureFlagContext";
import { FLAG_KEYS } from "../../lib/feature-flag-keys";
import { KeyboardShortcutsOverlay } from "../common/KeyboardShortcutsOverlay";
import { useGoShortcuts } from "../../hooks/useGoShortcuts";
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

  useEffect(() => setMounted(true), []);

  // Register service worker for push notifications
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // Lock body scroll when activity sheet is open
  useEffect(() => {
    if (activityOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [activityOpen]);

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

  const pathname = usePathname();

  // Close mobile overlay on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Show loader while agents are being fetched
  if (agents === undefined) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-border border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show onboarding only when there are no agents at all (or only deactivated ones),
  // but allow through if user is already on an agent creation/setup route
  const isAgentRoute = pathname === "/agents" || pathname?.startsWith("/agents/");
  const hasRelevantAgents = agents.some(
    (a: Agent) => a.setupStatus === "active" || a.setupStatus === "pending_setup",
  );
  const showOnboarding = !hasRelevantAgents && !isAgentRoute;

  // Show a "waiting" banner when all agents are pending_setup (none active yet)
  const hasActiveAgent = agents.some((a: Agent) => a.setupStatus === "active");
  const hasPendingAgent = agents.some((a: Agent) => a.setupStatus === "pending_setup");
  const showWaitingBanner = hasPendingAgent && !hasActiveAgent;

  if (showOnboarding) {
    return (
      <>
        <OnboardingView />
        <Toaster position="bottom-right" richColors />
      </>
    );
  }

  return (
    <div className="flex h-screen bg-muted">
      {/* Sidebar backdrop (mobile) */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={handleCloseSidebar} />
      )}

      {/* Icon rail only */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50
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
            <div className="mx-4 mt-4 px-4 py-3 bg-warning-muted border border-warning/30 rounded-lg flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-warning animate-pulse flex-shrink-0" />
              <p className="text-sm text-warning">
                Waiting for agents to connect&hellip;{" "}
                <Link
                  href="/agents"
                  className="font-medium text-warning underline underline-offset-2 hover:text-warning"
                >
                  View setup instructions
                </Link>
              </p>
            </div>
          )}
          <WhenFeatureEnabled flag={FLAG_KEYS.NOTIFICATIONS}>
            <PushPermissionBanner />
          </WhenFeatureEnabled>
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
      {mounted &&
        createPortal(
          <>
            {activityOpen && (
              <div
                key="activity-backdrop"
                className="fixed inset-0 bg-black/30 z-40"
                onClick={handleCloseActivity}
              />
            )}
            <aside
              key="activity-drawer"
              className={`
                fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-background border-l border-border shadow-xl
                flex flex-col
                transition-transform duration-200 ease-in-out
                ${activityOpen ? "translate-x-0" : "translate-x-full"}
              `}
            >
              <ErrorBoundary
                fallback={({ resetErrorBoundary, error }) => (
                  <PanelErrorFallback
                    label="Activity feed"
                    error={error}
                    onRetry={resetErrorBoundary}
                  />
                )}
              >
                <ActivityFeed onTaskClick={handleNotificationClick} onClose={handleCloseActivity} />
              </ErrorBoundary>
            </aside>
          </>,
          document.body,
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
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30">
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

      <KeyboardShortcutsOverlay />
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
