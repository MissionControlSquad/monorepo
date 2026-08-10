"use client";

import { useState, memo, useRef, useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  Archive,
  Inbox,
  UserCheck,
  PlayCircle,
  Eye,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { TaskCard } from "./TaskCard";
import { Button, Tooltip } from "../ui";
import type { TaskCard as TaskCardType, Agent } from "@agentcenter/types";
import { TaskStatus } from "@/server/constants";

/** Plain-language explanation of what it means for a task to sit in each status group. */
const STATUS_HELP: Record<string, string> = {
  [TaskStatus.BACKLOG]:
    "Captured for later. Not ready to start and no agent will pick these up yet.",
  [TaskStatus.INBOX]: "New tasks waiting to be triaged and assigned to an agent.",
  [TaskStatus.ASSIGNED]: "An agent has been assigned but hasn't started working yet.",
  [TaskStatus.IN_PROGRESS]: "An agent is actively working on these tasks right now.",
  [TaskStatus.REVIEW]: "Work is finished and waiting for you to approve it or request changes.",
  [TaskStatus.DONE]: "Approved and complete. Nothing more to do here.",
  [TaskStatus.BLOCKED]:
    "Stuck on a dependency or problem and can't move forward until it's resolved.",
};
const COLUMN_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  [TaskStatus.BACKLOG]: Archive,
  [TaskStatus.INBOX]: Inbox,
  [TaskStatus.ASSIGNED]: UserCheck,
  [TaskStatus.IN_PROGRESS]: PlayCircle,
  [TaskStatus.REVIEW]: Eye,
  [TaskStatus.DONE]: CheckCircle2,
  [TaskStatus.BLOCKED]: AlertTriangle,
};

const ICON_COLOR_MAP: Record<string, string> = {
  slate: "text-slate-500",
  gray: "text-muted-foreground",
  blue: "text-blue-500",
  yellow: "text-yellow-500",
  purple: "text-purple-500",
  green: "text-green-500",
  red: "text-red-500",
};

const COUNT_COLOR_MAP: Record<string, string> = {
  slate: "text-slate-600",
  gray: "text-muted-foreground",
  blue: "text-blue-600",
  yellow: "text-yellow-600",
  purple: "text-purple-600",
  green: "text-green-600",
  red: "text-red-600",
};

interface StatusRowProps {
  id: string;
  label: string;
  color: string;
  tasks: TaskCardType[];
  totalCount: number;
  hasMore: boolean;
  onLoadMore: () => void;
  isLoadingMore: boolean;
  agents: Agent[];
  onTaskClick: (task: TaskCardType) => void;
  hasActiveFilters?: boolean;
}

const INITIAL_VISIBLE = 20;

export const StatusRow = memo(function StatusRow({
  id,
  label,
  color,
  tasks,
  totalCount,
  hasMore,
  onLoadMore,
  isLoadingMore,
  agents,
  onTaskClick,
  hasActiveFilters,
}: StatusRowProps) {
  const [collapsed, setCollapsed] = useState(id === TaskStatus.DONE);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  const visibleTasks = tasks.slice(0, visibleCount);
  const hiddenClientCount = tasks.length - visibleCount;
  const showClientMore = hiddenClientCount > 0;
  const showServerMore = !showClientMore && hasMore;
  const showTotalCount = totalCount > tasks.length;

  // Auto-load more from server when sentinel scrolls into view
  useEffect(() => {
    if (collapsed) return;
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !showServerMore || isLoadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "100px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [collapsed, showServerMore, isLoadingMore, onLoadMore]);

  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  const IconComponent = COLUMN_ICON_MAP[id];
  const iconColor = ICON_COLOR_MAP[color] || "text-muted-foreground";
  const countColor = COUNT_COLOR_MAP[color] || "text-muted-foreground";

  return (
    <div className="mb-1">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-muted/60 transition-colors group/header"
      >
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
            collapsed ? "-rotate-90" : ""
          }`}
        />
        {IconComponent && <IconComponent className={`w-4 h-4 ${iconColor}`} />}
        {STATUS_HELP[id] ? (
          <Tooltip content={STATUS_HELP[id]} side="bottom">
            <span className="text-sm font-semibold text-foreground">{label}</span>
          </Tooltip>
        ) : (
          <span className="text-sm font-semibold text-foreground">{label}</span>
        )}
        <span className={`text-sm font-semibold ${countColor}`}>
          {showTotalCount ? `${tasks.length} / ${totalCount}` : tasks.length}
        </span>
      </button>

      {/* Card grid */}
      {!collapsed && (
        <div
          ref={setNodeRef}
          className={`mt-1 rounded-xl p-2 transition-all duration-200 min-h-[60px] ${
            isOver ? "bg-blue-50 ring-2 ring-blue-300 ring-dashed" : ""
          }`}
        >
          {tasks.length === 0 ? (
            <div className="flex items-center justify-center h-14 text-xs text-muted-foreground">
              {hasActiveFilters
                ? "No tasks match your filters. Clear a filter to see more."
                : `Nothing in ${label.toLowerCase()} yet. Tasks show up once they reach this stage.`}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 @xl:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4 gap-3">
                {visibleTasks.map((task) => (
                  <TaskCard key={task.id} task={task} agents={agents} onClick={onTaskClick} />
                ))}
              </div>

              {/* Client-side "Show more" */}
              {showClientMore && (
                <div className="flex justify-center mt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setVisibleCount((prev) => prev + INITIAL_VISIBLE)}
                    className="text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  >
                    Show {Math.min(hiddenClientCount, INITIAL_VISIBLE)} more
                  </Button>
                </div>
              )}

              {/* Server-side auto-load sentinel (loads more when visible) */}
              {showServerMore && (
                <div ref={loadMoreSentinelRef} className="flex justify-center mt-3 min-h-[32px]">
                  {isLoadingMore && (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading...
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});
