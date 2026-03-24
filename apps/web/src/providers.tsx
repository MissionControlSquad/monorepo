"use client";

import { ErrorBoundary, FullPageErrorFallback } from "./components/common/ErrorBoundary";
import { AppProvider } from "./components/context/AppContext";
import { AgentStatusProvider } from "./components/context/AgentStatusContext";
import { ProfileSidebarProvider } from "./components/context/ProfileSidebarContext";
import { AgentDetailProvider } from "./components/context/AgentDetailContext";
import { ProjectDetailProvider } from "./components/context/ProjectDetailContext";
import { MentionDataProvider } from "./components/context/MentionDataContext";
import { TaskListProvider } from "./components/context/TaskListContext";
import { UrqlProvider } from "./lib/graphql/provider";
import { ConnectionStatusBanner } from "./components/common/ConnectionStatusBanner";
import { NotificationCountProvider } from "@agentcenter/hooks";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UrqlProvider>
      <ConnectionStatusBanner />
      <ErrorBoundary fallback={<FullPageErrorFallback />}>
        <NotificationCountProvider serverUrl="" isSignedIn={true}>
          <AgentStatusProvider>
            <AppProvider>
              <MentionDataProvider>
                <ProfileSidebarProvider>
                  <AgentDetailProvider>
                    <ProjectDetailProvider>
                      <TaskListProvider>{children}</TaskListProvider>
                    </ProjectDetailProvider>
                  </AgentDetailProvider>
                </ProfileSidebarProvider>
              </MentionDataProvider>
            </AppProvider>
          </AgentStatusProvider>
        </NotificationCountProvider>
      </ErrorBoundary>
    </UrqlProvider>
  );
}
