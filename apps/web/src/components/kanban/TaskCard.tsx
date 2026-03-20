"use client";

import { memo, useCallback } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Zap, GripVertical, WifiOff, ArrowUpRight, FolderKanban, Link2, Clock } from "lucide-react";
import { MentionText } from "../common/MarkdownWithMentions";
import { TimeAgo } from "../common/TimeAgo";
import { Badge, DueDatePill } from "../ui";
import { ProfileAvatar } from "../ui/ProfileAvatar";
import { useQuery } from "urql";
import { PROJECT_QUERY } from "../../lib/graphql/queries";
import {
  PRIORITY_COLORS,
  AGENT_DETAILED_STATUSES,
  HEARTBEAT_TIMEOUT_MS,
  type AgentDetailedStatus,
} from "../../lib/constants";
import { useAgentStatus } from "../context/AgentStatusContext";
import type { TaskCard as TaskCardType, TaskAssignee, Agent } from "@agentcenter/types";

interface ResolvedAssignee {
  id: string;
  name: string;
  avatar: string | null;
  lastHeartbeat: string | null;
  currentTaskId: string | null;
  detailedStatus: string | null;
}

interface TaskCardProps {
  task: TaskCardType & { description?: string | null };
  agents: Agent[];
  onClick: (task: TaskCardType) => void;
}

export const TaskCard = memo(function TaskCard({ task, agents: _agents, onClick }: TaskCardProps) {
  const [projectResult] = useQuery({
    query: PROJECT_QUERY,
    variables: { id: task.projectId! },
    pause: !task.projectId,
  });
  const taskProject = projectResult.data?.project;
  const { agents: liveAgents } = useAgentStatus();

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  const handleClick = useCallback(() => onClick(task), [onClick, task]);

  // Build assignee display: use live agent data from AgentStatusContext
  // for real-time currentTaskId/detailedStatus/lastHeartbeat updates
  const assignedAgents: ResolvedAssignee[] = (task.assignees ?? []).map((a: TaskAssignee) => {
    const profile = a.profile;
    const agent = profile?.agent;
    const agentId = agent?.id ?? profile?.agentId;
    const live = liveAgents?.find((la: Agent) => la.id === agentId);
    return {
      id: agentId ?? a.profileId,
      name: profile?.displayName ?? live?.name ?? agent?.name ?? "Unknown",
      avatar: profile?.avatarUrl ?? null,
      lastHeartbeat: live?.lastHeartbeat ?? agent?.lastHeartbeat ?? null,
      currentTaskId: live?.currentTaskId ?? agent?.currentTaskId ?? null,
      detailedStatus: live?.detailedStatus ?? agent?.detailedStatus ?? null,
    };
  });

  const workingAgents = assignedAgents.filter((a: ResolvedAssignee) => a.currentTaskId === task.id);

  const hasActiveWork = workingAgents.length > 0;

  const priorityBorder =
    task.priority === "urgent"
      ? "border-l-rose-500"
      : task.priority === "high"
        ? "border-l-red-400"
        : task.priority === "medium"
          ? "border-l-amber-400"
          : "border-l-transparent";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative bg-background rounded-xl border border-l-[3px] shadow-sm transition-all duration-150 flex flex-col cursor-pointer hover:-translate-y-0.5 hover:shadow-md overflow-hidden hover:z-10 ${priorityBorder} ${
        hasActiveWork ? "border-warning ring-2 ring-warning/15" : "border-border"
      }`}
      onClick={handleClick}
    >
      {/* Drag handle -- only visible on hover */}
      <div
        {...listeners}
        {...attributes}
        className="absolute top-5 left-1 p-0 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-grab active:cursor-grabbing transition-all z-10 opacity-0 group-hover:opacity-100"
        title="Drag to move"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-4 h-4" />
      </div>

      <div className="p-3 sm:p-4 flex flex-col flex-1 pl-6 sm:pl-7">
        {/* Active work indicator */}
        {hasActiveWork && (
          <div className="flex items-center space-x-1 mb-2 pb-2 border-b border-warning/30">
            <Zap className="w-3 h-3 text-warning animate-pulse" />
            <span className="text-xs font-semibold text-warning uppercase tracking-wide">
              {workingAgents.length} working
            </span>
          </div>
        )}

        {/* Title row with agent avatars */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-foreground text-sm leading-snug flex-1 min-w-0">
            {task.taskNumber && (
              <span className="text-muted-foreground font-normal mr-1">#{task.taskNumber}</span>
            )}
            {task.title}
          </h3>
          {assignedAgents.length > 0 && (
            <div className="flex -space-x-1.5 shrink-0">
              {assignedAgents.slice(0, 3).map((agent: ResolvedAssignee) => {
                const isWorking = agent.currentTaskId === task.id;
                const agentDetailedStatus = agent.detailedStatus as AgentDetailedStatus | undefined;
                const detailedLabel = agentDetailedStatus
                  ? AGENT_DETAILED_STATUSES[agentDetailedStatus]?.label
                  : undefined;
                const agentIsOffline = agent.lastHeartbeat
                  ? Date.now() - new Date(agent.lastHeartbeat).getTime() > HEARTBEAT_TIMEOUT_MS
                  : true;
                const tooltipText = `${agent.name}${isWorking ? ` (${detailedLabel || "Working"})` : ""}${agentIsOffline ? " [Offline]" : ""}`;
                return (
                  <div key={agent.id} className="relative group/avatar">
                    <ProfileAvatar
                      agentId={agent.id}
                      size="sm"
                      className={`border-2 border-white ${
                        agentIsOffline
                          ? "opacity-60 grayscale"
                          : isWorking
                            ? "animate-pulse ring-2 ring-warning/30"
                            : ""
                      }`}
                    />
                    {agentIsOffline && (
                      <WifiOff className="absolute bottom-0 right-0 w-2.5 h-2.5 text-muted-foreground bg-background rounded-full" />
                    )}
                    {/* Styled tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[11px] font-medium text-white bg-neutral-900 dark:bg-neutral-700 rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover/avatar:opacity-100 transition-opacity z-50 shadow-lg">
                      {tooltipText}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900 dark:border-t-neutral-700" />
                    </div>
                  </div>
                );
              })}
              {assignedAgents.length > 3 && (
                <div className="w-6 h-6 rounded-full bg-muted border-2 border-white flex items-center justify-center text-muted-foreground text-[10px] font-medium">
                  +{assignedAgents.length - 3}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
            <MentionText content={task.description} />
          </p>
        )}

        {/* Tags */}
        {task.tags && task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {task.tags.slice(0, 2).map((tag: string, idx: number) => (
              <Badge key={idx} variant="yellow">
                {tag}
              </Badge>
            ))}
            {task.tags.length > 2 && (
              <span className="text-[10px] text-muted-foreground">+{task.tags.length - 2}</span>
            )}
          </div>
        )}

        {/* Bottom row: updated, project, due date, priority, parent indicator */}
        <div className="flex items-center gap-2 mt-auto pt-3 flex-wrap">
          {task.updatedAt && (
            <span
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
              title="Last updated"
            >
              <Clock className="w-3 h-3 shrink-0" />
              <TimeAgo date={task.updatedAt} className="text-muted-foreground" tooltip />
            </span>
          )}
          {taskProject && (
            <Badge variant="indigo">
              <FolderKanban className="w-3 h-3" />
              {taskProject.name}
            </Badge>
          )}
          {task.parentTaskId && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] text-indigo-500 font-medium"
              title="Child task"
            >
              <ArrowUpRight className="w-3 h-3" />
              child
            </span>
          )}
          {task.blockedByTaskId && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] text-destructive font-medium"
              title="Blocked by another task"
            >
              <Link2 className="w-3 h-3" />
              blocked
            </span>
          )}
          {task.dueDate && <DueDatePill dueDate={task.dueDate} isDone={task.status === "done"} />}
          {task.priority && (
            <span
              className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS]}`}
            >
              {task.priority}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
