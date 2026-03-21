"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useQuery } from "urql";
import { PROJECT_QUERY } from "../../../../lib/graphql/queries";
import { SYSTEM_SETTINGS_QUERY } from "../../../../lib/graphql/mutations/system";
import { Bot, Plus, ShieldOff, UserPlus } from "lucide-react";
import { useAgentStatus } from "../../../context/AgentStatusContext";
import { useAppContext } from "../../../context/AppContext";
import { AgentRow } from "../AgentRow";
import { SidebarPanelHeader } from "../SidebarPanelHeader";
import { SidebarSkeleton } from "../SidebarSkeleton";
import { SidebarEmptyState } from "../SidebarEmptyState";
import type { Agent, ProjectMember, StatusHistoryEntry } from "@agentcenter/types";

interface AgentsPanelProps {
  onTaskClick?: (taskId: string) => void;
}

export function AgentsPanel({ onTaskClick }: AgentsPanelProps) {
  const pathname = usePathname();
  const selectedAgentId = pathname?.match(/^\/agents\/([^/]+)$/)?.[1] ?? null;
  const { agents, transitions } = useAgentStatus();
  const { projectId } = useAppContext();
  const [projectResult] = useQuery({
    query: PROJECT_QUERY,
    variables: { id: projectId! },
    pause: !projectId,
  });
  const project = projectResult.data?.project;

  const [systemSettingsResult] = useQuery({ query: SYSTEM_SETTINGS_QUERY });
  const shutdownActive = systemSettingsResult.data?.systemSettings?.shutdownActive ?? false;

  const filteredAgents = agents
    ? (projectId && project?.members
        ? agents.filter((a: Agent) =>
            project.members.some(
              (m: ProjectMember) => m.profile?.agentId === a.id || m.profile?.agent?.id === a.id,
            ),
          )
        : agents
      ).filter((a: Agent) => a.setupStatus !== "deactivated")
    : undefined;

  return (
    <div className="h-full flex flex-col">
      <SidebarPanelHeader
        title="Agents"
        action={
          <Link
            href="/agents/new"
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 rounded-md transition-colors"
            title="Add agent"
          >
            <UserPlus className="w-3 h-3" />
            Add
          </Link>
        }
      />

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto py-1 space-y-0.5 px-2">
        {!filteredAgents ? (
          <SidebarSkeleton count={3} height="h-12" />
        ) : filteredAgents.length === 0 ? (
          <SidebarEmptyState
            icon={<Bot />}
            message={projectId ? "No members in this project" : "No agents yet"}
            action={
              <Link
                href="/agents/new"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add your first agent
              </Link>
            }
          />
        ) : (
          filteredAgents.map((agent: Agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              transition={
                (transitions as unknown as Record<string, StatusHistoryEntry> | undefined)?.[
                  agent.id
                ]
              }
              onTaskClick={onTaskClick}
              isSelected={agent.id === selectedAgentId}
            />
          ))
        )}
      </div>

      {/* Shutdown banner */}
      {shutdownActive && (
        <div className="flex-shrink-0 mx-2 mb-2 px-3 py-2 bg-destructive-muted border border-destructive/30 rounded-lg">
          <div className="flex items-center gap-2 text-xs font-medium text-destructive">
            <ShieldOff className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Shutdown active</span>
            <Link
              href="/settings"
              className="ml-auto text-destructive hover:text-destructive underline"
            >
              Manage
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
