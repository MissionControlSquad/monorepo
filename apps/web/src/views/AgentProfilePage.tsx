"use client";

import { useState } from "react";
import { useQuery } from "urql";
import { AGENT_QUERY } from "../lib/graphql/queries";
import { AgentProfileHeader } from "../components/profile/AgentProfileHeader";
import { AgentProfileStats } from "../components/profile/AgentProfileStats";
import { CurrentWorkSection } from "../components/profile/CurrentWorkSection";
import { AssignedTasksList } from "../components/profile/AssignedTasksList";
import { RecentDeliverablesList } from "../components/profile/RecentDeliverablesList";
import { AgentActivityTimeline } from "../components/profile/AgentActivityTimeline";
import {
  ClipboardList,
  FileText,
  Activity,
  Loader2,
  AlertCircle,
  Power,
  PowerOff,
  Download,
  Wrench,
  Palmtree,
  Cloud,
  Server,
} from "lucide-react";
import { Breadcrumbs, Button } from "@/components/ui";
import { useFeatureFlag } from "@/components/context/FeatureFlagContext";
import { FLAG_KEYS } from "@/lib/feature-flag-keys";
import Link from "next/link";
import { useMutation } from "urql";
import { SET_AGENT_ACTIVATION, SET_AGENT_VACATION } from "../lib/graphql/mutations/agents";
import { useCurrentProject } from "../components/context/AppContext";

type MobileTab = "tasks" | "deliverables" | "activity";

const TABS: { id: MobileTab; label: string; icon: typeof ClipboardList }[] = [
  { id: "tasks", label: "Tasks", icon: ClipboardList },
  { id: "deliverables", label: "Deliverables", icon: FileText },
  { id: "activity", label: "Activity", icon: Activity },
];

interface AgentProfilePageProps {
  agentId: string;
}

export function AgentProfilePage({ agentId }: AgentProfilePageProps) {
  const [activeTab, setActiveTab] = useState<MobileTab>("tasks");
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchDone, setPatchDone] = useState<string | null>(null);
  const [vacationConfirm, setVacationConfirm] = useState<"start" | "end" | null>(null);
  const [vacationLoading, setVacationLoading] = useState(false);
  const { projectId } = useCurrentProject();
  const [, executeSetActivation] = useMutation(SET_AGENT_ACTIVATION);
  const [, executeSetVacation] = useMutation(SET_AGENT_VACATION);
  const cloudVmsEnabled = useFeatureFlag(FLAG_KEYS.CLOUD_VMS);
  const [agentResult, reexecuteAgentQuery] = useQuery({
    query: AGENT_QUERY,
    variables: { id: agentId },
    pause: !agentId,
  });
  const agent = agentResult.data?.agent;

  if (!agentId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        No agent selected
      </div>
    );
  }

  if (agentResult.fetching && !agentResult.data) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Agent not found
      </div>
    );
  }

  return (
    <div className="@container flex-1 flex flex-col overflow-hidden">
      {/* Breadcrumbs */}
      <div className="flex-shrink-0 px-3 @xl:px-4 @3xl:px-6 pt-3 @xl:pt-4">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Agents", href: "/agents" },
            { label: agent?.name ?? "..." },
          ]}
        />
      </div>

      {/* Top section -- does not scroll */}
      <div className="flex-shrink-0 px-3 @xl:px-4 @3xl:px-6 pt-0 pb-2 space-y-3 @xl:space-y-4">
        {agent.setupStatus === "pending_setup" && (
          <Link
            href={`/agents/${agent.id}/setup`}
            className="flex items-center gap-3 px-4 py-3 bg-warning-muted border border-warning/30 rounded-lg hover:bg-warning/15 transition"
          >
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-warning">Setup not complete</p>
              <p className="text-xs text-warning">
                Click to view setup instructions and config files
              </p>
            </div>
          </Link>
        )}
        {agent.setupStatus === "deactivated" && (
          <div className="flex items-center gap-3 px-4 py-3 bg-muted border border-border rounded-lg">
            <PowerOff className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Agent deactivated</p>
              <p className="text-xs text-muted-foreground">
                This agent is not running. Reactivate to resume operations.
              </p>
            </div>
            <Button
              variant="success"
              size="xs"
              onClick={() => executeSetActivation({ id: agent.id, deactivated: false })}
              className="border-0 flex-shrink-0"
            >
              <Power className="w-3.5 h-3.5" />
              Reactivate
            </Button>
          </div>
        )}
        {agent.isOnVacation && (
          <div className="flex items-center gap-3 px-4 py-3 bg-warning-muted border border-warning/30 rounded-lg">
            <Palmtree className="w-5 h-5 text-warning flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-warning">Agent is on vacation</p>
              <p className="text-xs text-warning">Not accepting new tasks while on vacation.</p>
            </div>
            {vacationConfirm === "end" ? (
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  size="xs"
                  disabled={vacationLoading}
                  onClick={async () => {
                    setVacationLoading(true);
                    try {
                      const result = await executeSetVacation({ id: agent.id, onVacation: false });
                      if (result.error) throw result.error;
                    } catch {
                      // error handled by urql
                    } finally {
                      setVacationLoading(false);
                      setVacationConfirm(null);
                    }
                  }}
                  className="bg-warning hover:bg-warning"
                >
                  {vacationLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                  {vacationLoading ? "Ending..." : "Confirm"}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={vacationLoading}
                  onClick={() => setVacationConfirm(null)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="warning"
                size="xs"
                onClick={() => setVacationConfirm("end")}
                className="border-0 flex-shrink-0"
              >
                <Power className="w-3.5 h-3.5" />
                End vacation
              </Button>
            )}
          </div>
        )}
        {!agent.isOnVacation && agent.setupStatus === "active" && !agent.upgradeAvailable && (
          <div className="flex justify-end">
            {vacationConfirm === "start" ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Put agent on vacation?</span>
                <Button
                  size="xs"
                  disabled={vacationLoading}
                  onClick={async () => {
                    setVacationLoading(true);
                    try {
                      const result = await executeSetVacation({ id: agent.id, onVacation: true });
                      if (result.error) throw result.error;
                    } catch {
                      // error handled by urql
                    } finally {
                      setVacationLoading(false);
                      setVacationConfirm(null);
                    }
                  }}
                  className="bg-warning hover:bg-warning"
                >
                  {vacationLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                  {vacationLoading ? "Updating..." : "Confirm"}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={vacationLoading}
                  onClick={() => setVacationConfirm(null)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="warning" size="xs" onClick={() => setVacationConfirm("start")}>
                <Palmtree className="w-3.5 h-3.5" />
                Put on vacation
              </Button>
            )}
          </div>
        )}
        {agent.upgradeAvailable && agent.setupStatus === "active" && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 space-y-3">
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-800">Upgrade available</p>
                <p className="text-xs text-blue-600">
                  New HEARTBEAT/PLAYBOOK or APIs are available. Download files or assign the agent a
                  task to upgrade itself.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/agents/${agent.id}/setup`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition"
              >
                View setup
              </a>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={downloadLoading}
                onClick={async () => {
                  setDownloadLoading(true);
                  try {
                    const res = await fetch(`/api/agents/${agent.id}/config-bundle`, {
                      credentials: "include",
                    });
                    if (!res.ok) throw new Error("Failed to fetch");
                    const data = await res.json();
                    const blob = new Blob([JSON.stringify(data, null, 2)], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    const safeSlug = (agent.username || agent.id).replace(/[^a-zA-Z0-9_-]/g, "_");
                    const safeVersion = String(data.version || "latest").replace(
                      /[^a-zA-Z0-9._-]/g,
                      "_",
                    );
                    a.download = `agent-config-${safeSlug}-v${safeVersion}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } finally {
                    setDownloadLoading(false);
                  }
                }}
                className="text-blue-700 bg-blue-100 hover:bg-blue-200"
              >
                {downloadLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Download files
              </Button>
              <Button
                type="button"
                size="xs"
                disabled={patchLoading}
                onClick={async () => {
                  setPatchLoading(true);
                  setPatchDone(null);
                  try {
                    const res = await fetch(`/api/agents/${agent.id}/request-config-upgrade`, {
                      method: "POST",
                      credentials: "include",
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      throw new Error(err.error || "Failed to create task");
                    }
                    const data = await res.json();
                    setPatchDone(data.task?.id ?? "created");
                    reexecuteAgentQuery({ requestPolicy: "network-only" });
                  } catch {
                    setPatchDone("error");
                  } finally {
                    setPatchLoading(false);
                  }
                }}
              >
                {patchLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wrench className="w-3.5 h-3.5" />
                )}
                Ask agent to patch
              </Button>
            </div>
            {patchDone && patchDone !== "error" && (
              <p className="text-xs text-success">
                Upgrade task created and assigned. The agent will see it on next heartbeat.
              </p>
            )}
            {patchDone === "error" && (
              <p className="text-xs text-destructive">Could not create upgrade task. Try again.</p>
            )}
          </div>
        )}
        <AgentProfileHeader agent={agent} />
        {cloudVmsEnabled && agent.hostingType === "cloudVM" && agent.cloudVm && (
          <Link
            href={`/cloud/${agent.cloudVm.id}`}
            className="flex items-center gap-3 px-4 py-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition"
          >
            <Server className="w-5 h-5 text-purple-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-purple-800">Cloud VM</p>
              <p className="text-xs text-purple-600">
                Running on {agent.cloudVm.name || agent.cloudVm.id.slice(0, 8)}
                {agent.cloudVm.ipv4 && ` (${agent.cloudVm.ipv4})`}
              </p>
            </div>
            <Cloud className="w-4 h-4 text-purple-400" />
          </Link>
        )}
        <AgentProfileStats agentId={agent.id} projectId={projectId ?? undefined} />
        <CurrentWorkSection agent={agent} />
      </div>

      {/* Tab bar -- hidden when container is wide enough for 3 columns */}
      <div className="flex-shrink-0 @4xl:hidden px-3 @3xl:px-6 pb-2">
        <div className="flex bg-muted rounded-lg p-1 gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-sm font-medium transition ${
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div
        className={`
          flex-1 min-h-0 px-3 @3xl:px-6 pb-3 @3xl:pb-4 pt-0 @4xl:pt-1
          flex flex-col
          @4xl:grid @4xl:gap-4
          @4xl:grid-cols-3 @4xl:grid-rows-[1fr]
        `}
      >
        {/* Tasks */}
        <div
          className={`
            min-h-0 flex-1
            ${activeTab === "tasks" ? "" : "hidden"} @4xl:flex-none @4xl:h-full @4xl:block
          `}
        >
          <AssignedTasksList agentId={agent.id} projectId={projectId ?? undefined} />
        </div>

        {/* Deliverables */}
        <div
          className={`
            min-h-0 flex-1
            ${activeTab === "deliverables" ? "" : "hidden"} @4xl:flex-none @4xl:h-full @4xl:block
          `}
        >
          <RecentDeliverablesList agentId={agent.id} projectId={projectId ?? undefined} />
        </div>

        {/* Activity */}
        <div
          className={`
            min-h-0 flex-1
            ${activeTab === "activity" ? "" : "hidden"} @4xl:flex-none @4xl:h-full @4xl:block
          `}
        >
          <AgentActivityTimeline agentId={agent.id} projectId={projectId ?? undefined} />
        </div>
      </div>
    </div>
  );
}
