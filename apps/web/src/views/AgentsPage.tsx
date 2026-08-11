"use client";

import { useState } from "react";
import { filterAgentsBySetup } from "@agentcenter/utils";
import Link from "next/link";
import { useMutation } from "urql";
import { SET_AGENT_ACTIVATION } from "../lib/graphql/mutations/agents";
import { useAgentStatus } from "../components/context/AgentStatusContext";
import { StatusDot } from "../components/agent/AgentStatusBadge";
import {
  Plus,
  Loader2,
  AlertCircle,
  Bot,
  ArrowRight,
  PowerOff,
  Power,
  Search,
  Palmtree,
  WifiOff,
} from "lucide-react";
import { Breadcrumbs, Button, Badge, Card, Input, EmptyState, PageLayout } from "../components/ui";
import { ProfileAvatar } from "../components/ui/ProfileAvatar";
import { QuotaGate, QuotaIndicator } from "@/components/usage";
import { USAGE_QUOTA_SLUGS } from "@/lib/quota-slugs";
import { ErrorBoundary, PanelErrorFallback } from "../components/common/ErrorBoundary";
import type { AgentDetailedStatus } from "../lib/constants";
import type { AgentStatusValue } from "@/server/constants";
import { SetupStatus } from "@/server/constants";

type AgentFromQuery = {
  id: string;
  name: string;
  role?: string;
  status?: string;
  detailedStatus?: string;
  setupStatus: string;
  currentTask?: string;
  upgradeAvailable?: boolean;
  hostingType?: string;
  isOnVacation?: boolean;
};

export function AgentsPage() {
  const { agents: rawAgents, getOnlineInfo } = useAgentStatus();
  const agents = rawAgents as AgentFromQuery[] | undefined;
  const [, executeSetActivation] = useMutation(SET_AGENT_ACTIVATION);
  const [search, setSearch] = useState("");

  if (!agents) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const agentList = agents ?? ([] as AgentFromQuery[]);
  const activeAgents = filterAgentsBySetup(agentList, SetupStatus.ACTIVE, search);
  const pendingAgents = filterAgentsBySetup(agentList, SetupStatus.PENDING_SETUP, search);
  const deactivatedAgents = filterAgentsBySetup(agentList, SetupStatus.DEACTIVATED, search);
  const isEmpty = agents && agents.length === 0;
  const visibleCount = activeAgents.length + pendingAgents.length;

  if (isEmpty) {
    return (
      <EmptyState
        icon={<Bot />}
        title="Create your Squad Lead first"
        description="The Squad Lead is your team's orchestrator — it creates tasks, assigns work to agents, and approves deliverables. Set it up first so it's ready to coordinate when workers join."
        action={
          <Button
            variant="primary"
            size="lg"
            iconRight={<ArrowRight />}
            onClick={() => (window.location.href = "/agents/new")}
          >
            Create Squad Lead
          </Button>
        }
      />
    );
  }

  return (
    <PageLayout maxWidth="wide">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Agents" }]} />
      <ErrorBoundary
        fallback={({ resetErrorBoundary, error }) => (
          <PanelErrorFallback label="Agents" error={error} onRetry={resetErrorBoundary} />
        )}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Agents</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {visibleCount} agent{visibleCount !== 1 ? "s" : ""} in your squad
            </p>
          </div>
          <div className="flex items-center gap-3">
            <QuotaIndicator slug={USAGE_QUOTA_SLUGS.agents} />
            <QuotaGate slug={USAGE_QUOTA_SLUGS.agents}>
              <Link href="/agents/new">
                <Button variant="primary" icon={<Plus />}>
                  Create Agent
                </Button>
              </Link>
            </QuotaGate>
          </div>
        </div>

        {/* Search */}
        <div className="mb-5">
          <Input
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search />}
          />
        </div>

        {/* No results */}
        {search &&
          activeAgents.length === 0 &&
          pendingAgents.length === 0 &&
          deactivatedAgents.length === 0 && (
            <EmptyState
              icon={<Search />}
              title="No matching agents"
              description="Try adjusting your search."
            />
          )}

        {/* Pending setup agents */}
        {pendingAgents.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-warning uppercase tracking-wider mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Pending Setup ({pendingAgents.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingAgents.map((agent: AgentFromQuery) => (
                <Link
                  key={agent.id}
                  href={`/agents/${agent.id}/setup`}
                  className="block border-2 border-dashed border-warning/30 bg-warning-muted/50 rounded-xl p-4 hover:border-warning/40 hover:bg-warning-muted hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <ProfileAvatar agentId={agent.id} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate">{agent.name}</span>
                        <Badge variant="yellow">Pending Setup</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{agent.role}</p>
                    </div>
                  </div>
                  <p className="text-xs text-warning mt-3">Click to view setup instructions</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Active agents */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeAgents.map((agent: AgentFromQuery) => {
            const { isOnline } = getOnlineInfo(agent.id);
            const isVacation = agent.isOnVacation === true;
            return (
              <Card
                as={Link}
                key={agent.id}
                href={`/agents/${agent.id}`}
                padding="md"
                className={`block hover:border-border hover:shadow-md transition-all text-left w-full group ${isVacation ? "opacity-50" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <ProfileAvatar agentId={agent.id} size="md" />
                    <StatusDot
                      status={(agent.status || "idle") as AgentStatusValue}
                      detailedStatus={agent.detailedStatus as AgentDetailedStatus | undefined}
                      isOnline={isOnline}
                      className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground truncate group-hover:text-indigo-600 transition-colors">
                        {agent.name}
                      </span>
                      {isVacation && (
                        <Badge variant="yellow">
                          <Palmtree className="w-3 h-3" />
                          On Vacation
                        </Badge>
                      )}
                      {!isVacation && !isOnline && (
                        <Badge variant="gray">
                          <WifiOff className="w-3 h-3" />
                          Offline
                        </Badge>
                      )}
                      {agent.upgradeAvailable && <Badge variant="blue">Upgrade available</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{agent.role}</p>
                  </div>
                </div>
                {agent.upgradeAvailable && (
                  <p className="text-xs text-blue-600 mt-2">
                    Re-run setup to get new HEARTBEAT/PLAYBOOK and APIs.
                  </p>
                )}
                {agent.currentTask && (
                  <p className="text-xs text-muted-foreground mt-3 truncate">
                    Working on: {agent.currentTask}
                  </p>
                )}
              </Card>
            );
          })}

          {/* Create agent card */}
          <Link
            href="/agents/new"
            className="block border-2 border-dashed border-border rounded-xl p-4 hover:border-indigo-300 hover:bg-indigo-50/50 hover:shadow-sm transition-all flex items-center justify-center min-h-[120px]"
          >
            <div className="text-center">
              <Plus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <span className="text-sm text-muted-foreground">Create Agent</span>
            </div>
          </Link>
        </div>

        {/* Deactivated agents */}
        {deactivatedAgents.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <PowerOff className="w-4 h-4" />
              Deactivated ({deactivatedAgents.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {deactivatedAgents.map((agent: AgentFromQuery) => (
                <Card key={agent.id} padding="md" className="bg-muted opacity-60">
                  <div className="flex items-center gap-3">
                    <div className="grayscale">
                      <ProfileAvatar agentId={agent.id} size="md" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-muted-foreground truncate block">
                        {agent.name}
                      </span>
                      <p className="text-sm text-muted-foreground truncate">{agent.role}</p>
                    </div>
                    <Button
                      variant="success"
                      size="sm"
                      icon={<Power />}
                      onClick={() => executeSetActivation({ id: agent.id, deactivated: false })}
                    >
                      Reactivate
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </ErrorBoundary>
    </PageLayout>
  );
}
