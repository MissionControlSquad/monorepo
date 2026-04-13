"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "urql";
import { PROJECT_QUERY } from "../../../../lib/graphql/queries";
import { LayoutDashboard, Repeat, ChevronRight, Bot } from "lucide-react";
import { ProjectSwitcher } from "../../ProjectSwitcher";
import { useAgentStatus } from "../../../context/AgentStatusContext";
import { useAppContext } from "../../../context/AppContext";
import { AgentRow } from "../AgentRow";
import { SidebarSkeleton } from "../SidebarSkeleton";
import { SidebarEmptyState } from "../SidebarEmptyState";
import { useFeatureFlags } from "../../../context/FeatureFlagContext";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { Agent, ProjectMember, StatusHistoryEntry } from "@agentcenter/types";
import { SetupStatus } from "@/server/constants";

const NAV_LINKS: { href: string; icon: typeof LayoutDashboard; label: string; flag?: string }[] = [
  { href: "/", icon: LayoutDashboard, label: "Kanban Board" },
  {
    href: "/recurring-tasks",
    icon: Repeat,
    label: "Recurring Tasks",
    flag: FLAG_KEYS.RECURRING_TASKS,
  },
];

export function HomePanel() {
  const pathname = usePathname();
  const { isEnabled } = useFeatureFlags();
  const { agents, transitions } = useAgentStatus();
  const { projectId } = useAppContext();
  const [projectResult] = useQuery({
    query: PROJECT_QUERY,
    variables: { id: projectId! },
    pause: !projectId,
  });
  const project = projectResult.data?.project;

  const filteredAgents = agents
    ? (projectId && project?.members
        ? agents.filter((a: Agent) =>
            project.members.some(
              (m: ProjectMember) => m.profile?.agentId === a.id || m.profile?.agent?.id === a.id,
            ),
          )
        : agents
      ).filter((a: Agent) => a.setupStatus !== SetupStatus.DEACTIVATED)
    : undefined;

  return (
    <div className="h-full flex flex-col">
      {/* Project switcher */}
      <div className="flex-shrink-0 px-3 pt-4 pb-3">
        <ProjectSwitcher fullWidth />
      </div>

      {/* Navigation links */}
      <div className="flex-shrink-0 px-2 pb-2 space-y-0.5">
        {NAV_LINKS.filter(({ flag }) => !flag || isEnabled(flag)).map(
          ({ href, icon: Icon, label }) => {
            const active = href === "/" ? pathname === "/" : (pathname?.startsWith(href) ?? false);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-lg transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          },
        )}
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-border" />

      {/* Squad overview */}
      <div className="flex-shrink-0 px-3 pt-3 pb-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
          Squad
        </h3>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto py-1 space-y-0.5 px-2">
        {!filteredAgents ? (
          <SidebarSkeleton count={3} height="h-12" />
        ) : filteredAgents.length === 0 ? (
          <SidebarEmptyState
            icon={<Bot />}
            message={projectId ? "No members in this project" : "Waiting for agents..."}
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
            />
          ))
        )}
      </div>

      {/* View all agents link */}
      {filteredAgents && filteredAgents.length > 0 && (
        <div className="flex-shrink-0 px-2 pb-2">
          <Link
            href="/agents"
            className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
          >
            View all agents
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
