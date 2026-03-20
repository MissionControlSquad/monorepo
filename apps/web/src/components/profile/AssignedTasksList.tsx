"use client";

import { useState, useMemo } from "react";
import { useQuery } from "urql";
import { TASKS_BY_ASSIGNEE_QUERY, PROJECTS_QUERY } from "../../lib/graphql/queries";
import { useTaskNavigation } from "../../hooks/useTaskNavigation";
import { TASK_STATUSES } from "../../lib/constants";
import { TimeAgo } from "../common/TimeAgo";
import { ClipboardList, FolderKanban } from "lucide-react";
import { Card, Badge, SkeletonList } from "../ui";
import type { TaskListItem, Project } from "@agentcenter/types";

interface AssignedTasksListProps {
  agentId: string;
  projectId?: string;
}

const STATUS_BADGE_VARIANT: Record<
  string,
  "gray" | "blue" | "yellow" | "purple" | "green" | "red"
> = {
  inbox: "gray",
  assigned: "blue",
  in_progress: "yellow",
  review: "purple",
  done: "green",
  blocked: "red",
};

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-destructive",
  medium: "bg-warning",
  low: "bg-gray-300",
};

const STATUS_ORDER = ["in_progress", "review", "blocked", "assigned", "inbox", "done"];

export function AssignedTasksList({ agentId, projectId }: AssignedTasksListProps) {
  const [tasksResult] = useQuery({
    query: TASKS_BY_ASSIGNEE_QUERY,
    variables: { agentId, includeDone: true, projectId },
  });
  const tasks = tasksResult.data?.tasksByAssignee as TaskListItem[] | undefined;
  const [projectsResult] = useQuery({ query: PROJECTS_QUERY });
  const projects = projectsResult.data?.projects as Project[] | undefined;
  const openTask = useTaskNavigation();
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const projectMap = useMemo(() => {
    if (!projects) return new Map<string, string>();
    return new Map(projects.map((p: Project) => [p.id, p.name]));
  }, [projects]);

  const statusCounts = useMemo(() => {
    if (!tasks) return {};
    const counts: Record<string, number> = {};
    for (const task of tasks) {
      counts[task.status] = (counts[task.status] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  // Only show tabs for statuses that have tasks
  const availableTabs = useMemo(
    () => STATUS_ORDER.filter((s) => (statusCounts[s] || 0) > 0),
    [statusCounts],
  );

  const filtered = useMemo(() => {
    if (!tasks) return null;
    if (activeFilter === "all") return tasks;
    return tasks.filter((t) => t.status === activeFilter);
  }, [tasks, activeFilter]);

  // Reset filter if the active one no longer has tasks
  if (activeFilter !== "all" && tasks && !statusCounts[activeFilter]) {
    setActiveFilter("all");
  }

  return (
    <Card className="flex flex-col h-full">
      <div className="flex-shrink-0 px-3 py-2.5 @xl:px-5 @xl:py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Assigned Tasks</h3>
        {tasks && <span className="text-xs text-gray-400 font-medium">{tasks.length} total</span>}
      </div>

      {/* Status filter tabs */}
      {availableTabs.length > 1 && (
        <div className="flex-shrink-0 px-2 pt-2 pb-1 @xl:px-3 border-b border-gray-100">
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveFilter("all")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition ${
                activeFilter === "all"
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              All
              <span
                className={`text-[10px] ${activeFilter === "all" ? "text-gray-300" : "text-gray-400"}`}
              >
                {tasks?.length}
              </span>
            </button>
            {availableTabs.map((status) => {
              const config = TASK_STATUSES.find((s) => s.id === status);
              const isActive = activeFilter === status;
              return (
                <button
                  key={status}
                  onClick={() => setActiveFilter(status)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition ${
                    isActive ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {config?.label ?? status}
                  <span className={`text-[10px] ${isActive ? "text-gray-300" : "text-gray-400"}`}>
                    {statusCounts[status]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-100">
        {!filtered ? (
          <div className="p-5">
            <SkeletonList count={4} height="h-12" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2">
              <ClipboardList className="w-5 h-5 text-gray-300" />
            </div>
            <p className="text-sm text-gray-400">No tasks assigned</p>
            <p className="text-xs text-gray-300 mt-0.5">Tasks will appear here when assigned</p>
          </div>
        ) : (
          filtered.map((task) => {
            const statusConfig = TASK_STATUSES.find((s) => s.id === task.status);
            return (
              <div
                key={task.id}
                className="flex items-center gap-2.5 px-3 py-2 @xl:gap-3 @xl:px-5 @xl:py-2.5 hover:bg-gray-50 cursor-pointer transition group"
                onClick={() => openTask(task.taskNumber ?? task.id)}
              >
                {/* Priority dot */}
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority ?? "medium"] ?? PRIORITY_DOT.medium}`}
                />

                {/* Status pill — only show in "All" view */}
                {activeFilter === "all" && (
                  <Badge
                    variant={STATUS_BADGE_VARIANT[task.status] ?? "gray"}
                    size="sm"
                    className="flex-shrink-0"
                  >
                    {statusConfig?.label ?? task.status}
                  </Badge>
                )}

                {/* Title */}
                <span className="text-sm text-gray-900 truncate flex-1 group-hover:text-blue-600 transition-colors">
                  {task.title}
                </span>

                {/* Project badge */}
                {task.projectId && projectMap.get(task.projectId) && (
                  <Badge variant="indigo" size="sm" className="flex-shrink-0">
                    <FolderKanban className="w-2.5 h-2.5" />
                    {projectMap.get(task.projectId)}
                  </Badge>
                )}

                {/* Right metadata */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <TimeAgo
                    date={task.updatedAt!}
                    className="text-[11px] text-gray-400 hidden @xl:block"
                  />
                  {task.taskNumber != null && (
                    <span className="text-xs text-gray-400 font-mono">#{task.taskNumber}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
