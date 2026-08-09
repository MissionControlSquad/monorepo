"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "urql";
import Link from "next/link";
import { AlertCircle, Loader2, Palmtree, PowerOff } from "lucide-react";
import { AGENT_QUERY } from "../lib/graphql/queries";
import { Breadcrumbs } from "@/components/ui";
import { SetupStatus } from "@/server/constants";
import { useCurrentProject } from "../components/context/AppContext";
import { AgentProfileHeader } from "../components/profile/AgentProfileHeader";
import { AgentProfileStats } from "../components/profile/AgentProfileStats";
import { AgentSalaryCard } from "../components/profile/AgentSalaryCard";
import { AgentQueueCard } from "../components/profile/AgentQueueCard";
import { AgentMemoryCard } from "../components/profile/AgentMemoryCard";
import { AgentTrustCard } from "../components/profile/AgentTrustCard";
import { CurrentWorkSection } from "../components/profile/CurrentWorkSection";
import { AssignedTasksList } from "../components/profile/AssignedTasksList";
import { RecentDeliverablesList } from "../components/profile/RecentDeliverablesList";
import { AgentActivityTimeline } from "../components/profile/AgentActivityTimeline";
import { AgentEditPage } from "./AgentEditPage";
import { AgentDetailTabs } from "./agent-detail/AgentDetailTabs";
import { AgentToolsTab } from "./agent-detail/AgentToolsTab";
import { AgentRunsTab } from "./agent-detail/AgentRunsTab";
import { resolveAgentDetailTab } from "./agent-detail/agent-detail-tabs";

// Unified tabbed Agent Detail (Paperclip parity). URL-driven tabs via `?tab=`, with the Runs tab
// deep-linking to a single run via `&run=<id>`. Replaces the fragmented profile-scroll + separate
// edit page: every section (Overview, Tasks, Deliverables, Activity, Runs, Tools, Settings) lives
// behind one shareable URL. Reuses the existing profile cards and edit form wholesale.
interface AgentDetailPageProps {
  agentId: string;
}

export function AgentDetailPage({ agentId }: AgentDetailPageProps) {
  const searchParams = useSearchParams();
  const activeTab = resolveAgentDetailTab(searchParams.get("tab"));
  const runId = searchParams.get("run");
  const { projectId } = useCurrentProject();

  const [agentResult] = useQuery({
    query: AGENT_QUERY,
    variables: { id: agentId },
    pause: !agentId,
  });
  const agent = agentResult.data?.agent;

  if (!agentId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        No agent selected
      </div>
    );
  }

  if (agentResult.fetching && !agentResult.data) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (agentResult.error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium text-foreground">Could not load agent</p>
        <p className="text-xs">{agentResult.error.message}</p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm font-medium">Agent not found</p>
      </div>
    );
  }

  const projectArg = projectId ?? undefined;

  return (
    <div className="@container flex flex-1 flex-col overflow-hidden">
      {/* Fixed header: breadcrumbs, identity, status notices, tab bar */}
      <div className="flex-shrink-0 space-y-3 px-3 pt-3 @xl:px-4 @xl:pt-4 @3xl:px-6">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Agents", href: "/agents" },
            { label: agent.name ?? "..." },
          ]}
        />

        {agent.setupStatus === SetupStatus.PENDING_SETUP && (
          <Link
            href={`/agents/${agent.id}/setup`}
            className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-muted px-4 py-3 transition hover:bg-warning/15"
          >
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-warning" />
            <div className="flex-1">
              <p className="text-sm font-medium text-warning">Setup not complete</p>
              <p className="text-xs text-warning">View setup instructions and config files</p>
            </div>
          </Link>
        )}
        {agent.setupStatus === SetupStatus.DEACTIVATED && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted px-4 py-3">
            <PowerOff className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Agent deactivated</p>
          </div>
        )}
        {agent.isOnVacation && (
          <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-muted px-4 py-3">
            <Palmtree className="h-5 w-5 flex-shrink-0 text-warning" />
            <p className="text-sm font-medium text-warning">Agent is on vacation</p>
          </div>
        )}

        <AgentProfileHeader agent={agent} />

        <AgentDetailTabs agentId={agent.id} activeTab={activeTab} />
      </div>

      {/* Scrollable tab content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3 @xl:px-4 @3xl:px-6">
        {activeTab === "overview" && (
          <div className="space-y-3 @xl:space-y-4">
            <AgentProfileStats agentId={agent.id} projectId={projectArg} />
            <AgentSalaryCard agentId={agent.id} />
            <AgentQueueCard agentId={agent.id} />
            <AgentMemoryCard agentId={agent.id} currentProvider={agent.memoryProvider} />
            <AgentTrustCard agentId={agent.id} />
            <CurrentWorkSection agent={agent} />
          </div>
        )}

        {activeTab === "tasks" && (
          <div className="h-full min-h-[24rem]">
            <AssignedTasksList agentId={agent.id} projectId={projectArg} />
          </div>
        )}

        {activeTab === "deliverables" && (
          <div className="h-full min-h-[24rem]">
            <RecentDeliverablesList agentId={agent.id} projectId={projectArg} />
          </div>
        )}

        {activeTab === "activity" && (
          <div className="h-full min-h-[24rem]">
            <AgentActivityTimeline agentId={agent.id} projectId={projectArg} />
          </div>
        )}

        {activeTab === "runs" && <AgentRunsTab agentId={agent.id} runId={runId} />}

        {activeTab === "tools" && (
          <AgentToolsTab agentId={agent.id} agentName={agent.name ?? "this agent"} />
        )}

        {activeTab === "settings" && <AgentEditPage agentId={agent.id} embedded />}
      </div>
    </div>
  );
}
