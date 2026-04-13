"use client";

import { useState, useEffect, memo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "urql";
import { TASK_WORK_SUMMARY_QUERY } from "../../../lib/graphql/queries";
import {
  Zap,
  Brain,
  Code,
  Search,
  BookOpen,
  Rocket,
  TestTube2,
  PenTool,
  WifiOff,
  Clock,
  MessageCircle,
  Link as LinkIcon,
  Palmtree,
} from "lucide-react";
import { StatusDot } from "../../agent/AgentStatusBadge";
import { useAgentStatus } from "../../context/AgentStatusContext";
import { AGENT_DETAILED_STATUSES, type AgentDetailedStatus } from "../../../lib/constants";
import { ProfileAvatar } from "../../ui/ProfileAvatar";
import type { Agent, WorkSummary, StatusHistoryEntry } from "@agentcenter/types";
import { formatDurationLong, formatDuration } from "@agentcenter/utils";
import { SetupStatus, AgentStatus } from "@/server/constants";

export function useWorkTimer(taskId: string | undefined) {
  const [workSummaryResult] = useQuery({
    query: TASK_WORK_SUMMARY_QUERY,
    variables: { taskId: taskId! },
    pause: !taskId,
  });
  const workSummary = workSummaryResult.data?.taskWorkSummary;
  const [elapsed, setElapsed] = useState(0);

  const activeStartedAtRaw = (workSummary as WorkSummary)?.activeSessions?.[0]?.startedAt;
  const activeStartedAt = activeStartedAtRaw ? new Date(activeStartedAtRaw).getTime() : undefined;

  useEffect(() => {
    if (!activeStartedAt) {
      setElapsed(0);
      return;
    }

    const updateElapsed = () => {
      setElapsed(Date.now() - activeStartedAt);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeStartedAt]);

  return elapsed;
}

/** @deprecated use formatDurationLong from @agentcenter/utils */
export const formatElapsedTime = formatDurationLong;

const DETAILED_STATUS_ICONS: Record<string, any> = {
  thinking: Brain,
  coding: Code,
  reviewing: Search,
  researching: BookOpen,
  deploying: Rocket,
  testing: TestTube2,
  writing: PenTool,
  waiting_review: Clock,
  waiting_input: MessageCircle,
  waiting_dependency: LinkIcon,
};

export const AgentRow = memo(function AgentRow({
  agent,
  transition,
  onTaskClick,
  isSelected,
}: {
  agent: Agent;
  transition?: StatusHistoryEntry;
  onTaskClick?: (taskId: string) => void;
  isSelected?: boolean;
}) {
  const router = useRouter();
  const { getOnlineInfo } = useAgentStatus();
  const { isOnline, lastSeenFormatted } = getOnlineInfo(agent.id);
  const isPending = agent.setupStatus === SetupStatus.PENDING_SETUP;
  const isVacation = agent.isOnVacation === true;
  const isWorking = !!agent.currentTaskId;
  const elapsed = useWorkTimer(agent.currentTaskId ?? undefined);

  const detailedStatus = agent.detailedStatus as AgentDetailedStatus | undefined;
  const detailedConfig = detailedStatus ? AGENT_DETAILED_STATUSES[detailedStatus] : undefined;
  const DetailedIcon = detailedStatus ? DETAILED_STATUS_ICONS[detailedStatus] || Zap : null;

  let subtitle: string;
  if (isPending) {
    subtitle = "Pending setup";
  } else if (isVacation) {
    subtitle = "On vacation";
  } else if (!isOnline) {
    subtitle = `Offline - ${lastSeenFormatted}`;
  } else if (detailedConfig && transition?.timestamp) {
    subtitle = `${detailedConfig.label} for ${formatDuration(Date.now() - new Date(transition.timestamp).getTime())}`;
  } else if (detailedConfig) {
    subtitle = detailedConfig.label;
  } else if (transition?.timestamp) {
    const statusLabel =
      agent.status === AgentStatus.ACTIVE
        ? "Active"
        : agent.status === AgentStatus.IDLE
          ? "Idle"
          : "Blocked";
    subtitle = `${statusLabel} for ${formatDuration(Date.now() - new Date(transition.timestamp).getTime())}`;
  } else {
    subtitle = lastSeenFormatted;
  }

  return (
    <div
      className={`rounded-lg transition cursor-pointer ${isPending ? "bg-warning-muted border border-dashed border-warning/30" : isVacation ? "opacity-50 pointer-events-none" : isSelected ? "bg-primary/10" : "hover:bg-muted"}`}
      onClick={() => router.push(`/agents/${agent.id}`)}
    >
      <div className="flex items-center px-3 py-2 gap-3">
        <div className="relative flex-shrink-0">
          <ProfileAvatar agentId={agent.id} size="md" />
          <StatusDot
            status={agent.status}
            detailedStatus={detailedStatus}
            isOnline={isOnline}
            className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-foreground truncate hover:text-primary transition">
              {agent.name}
            </span>
            {isVacation && <Palmtree className="w-3 h-3 text-warning flex-shrink-0" />}
            {!isPending && !isVacation && !isOnline && (
              <WifiOff className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        </div>
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${isWorking ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-2 -mt-0.5">
            <div
              className={`flex items-center gap-1.5 text-xs text-warning bg-warning-muted rounded px-2 py-1 ${onTaskClick && agent.currentTaskId ? "cursor-pointer hover:bg-warning/15 transition" : ""}`}
              onClick={
                onTaskClick && agent.currentTaskId
                  ? (e: React.MouseEvent) => {
                      e.stopPropagation();
                      onTaskClick(agent.currentTaskId!);
                    }
                  : undefined
              }
            >
              {DetailedIcon ? (
                <DetailedIcon className="w-3 h-3 flex-shrink-0" />
              ) : (
                <Zap className="w-3 h-3 flex-shrink-0" />
              )}
              <span className="truncate">{agent.statusMessage || agent.currentTask}</span>
              {elapsed > 0 && (
                <span className="ml-auto flex-shrink-0 font-mono text-warning">
                  {formatDurationLong(elapsed)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
