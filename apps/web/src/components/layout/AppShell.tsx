"use client";

import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import { ErrorBoundary, PanelErrorFallback } from "../common/ErrorBoundary";
import { useTaskNavigation } from "../../hooks/useTaskNavigation";
import { useAgentStatus } from "../context/AgentStatusContext";
import type { Agent } from "@agentcenter/types";
import { Button } from "../ui";
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
  const router = useRouter();
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

  const pathname = usePathname();

  // ── Onboarding gate: fetch persisted onboarding status ──
  const [onboardingDone, setOnboardingDone] = useState<boolean | undefined>(undefined);

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

  // Close mobile overlay on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Fetch onboarding status once on mount
  useEffect(() => {
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((d) => setOnboardingDone(d.completed ?? false))
      .catch(() => setOnboardingDone(true)); // fail-open so the app isn't permanently locked
  }, []);

  // Derive whether we need to redirect to onboarding
  // If agents already exist, onboarding is effectively done regardless of the DB flag
  const hasAgents = agents !== undefined && agents.length > 0;
  const isOnboardingOrAgentRoute =
    pathname === "/onboarding" || pathname === "/agents" || pathname?.startsWith("/agents/");
  const needsOnboarding =
    onboardingDone !== undefined && !onboardingDone && !hasAgents && !isOnboardingOrAgentRoute;

  // Redirect to onboarding if not completed
  useEffect(() => {
    if (needsOnboarding) {
      router.push("/onboarding");
    }
  }, [needsOnboarding, router]);

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

  // Show loader while agents or onboarding status are being fetched
  if (agents === undefined || onboardingDone === undefined) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (needsOnboarding) {
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
  const hasActiveAgent = agents.some((a: Agent) => a.setupStatus === "active");
  const hasPendingAgent = agents.some((a: Agent) => a.setupStatus === "pending_setup");
  const showWaitingBanner = hasPendingAgent && !hasActiveAgent;

  const isOnboarding = pathname === "/onboarding";

  return (
    <div className="flex h-screen bg-muted">
      {/* Sidebar backdrop (mobile) */}
      {mobileOpen && !isOnboarding && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={handleCloseSidebar} />
      )}

      {/* Icon rail — hidden during onboarding */}
      {!isOnboarding && (
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
