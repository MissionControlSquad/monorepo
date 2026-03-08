"use client";

import { memo, useRef, useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  Inbox,
  UserCheck,
  PlayCircle,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { TaskCard } from "./TaskCard";
import { Badge } from "../ui";
import type { TaskCard as TaskCardType, Agent } from "@/lib/types";
const COLUMN_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  inbox: Inbox,
  assigned: UserCheck,
  in_progress: PlayCircle,
  review: Eye,
  done: CheckCircle2,
  blocked: AlertTriangle,
};

const COLOR_CLASSES = {
  gray: "bg-muted text-foreground",
  blue: "bg-indigo-100 text-indigo-700",
  yellow: "bg-amber-100 text-amber-700",
  purple: "bg-purple-100 text-purple-700",
  green: "bg-emerald-100 text-emerald-700",
  red: "bg-red-100 text-red-700",
};

const BADGE_VARIANT_MAP: Record<string, "gray" | "blue" | "yellow" | "green" | "red" | "purple"> = {
  gray: "gray",
  blue: "blue",
  yellow: "yellow",
  purple: "purple",
  green: "green",
  red: "red",
};

const ICON_COLOR_MAP: Record<string, string> = {
  gray: "text-muted-foreground",
  blue: "text-indigo-500",
  yellow: "text-amber-500",
  purple: "text-purple-500",
  green: "text-emerald-500",
  red: "text-red-500",
};

interface KanbanColumnProps {
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

export const KanbanColumn = memo(function KanbanColumn({
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
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  // Auto-load more when the sentinel scrolls into view
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    const scrollEl = scrollRef.current;
    if (!sentinel || !scrollEl || !hasMore || isLoadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { root: scrollEl, rootMargin: "100px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, onLoadMore]);

  const IconComponent = COLUMN_ICON_MAP[id];
  const iconColor = ICON_COLOR_MAP[color] || "text-muted-foreground";
  const showTotalCount = totalCount > tasks.length;

  return (
    <div className="w-64 sm:w-72 flex-shrink-0 bg-muted/80 rounded-xl p-2.5 sm:p-3 flex flex-col min-h-0 border border-border/80">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          {IconComponent && <IconComponent className={`w-4 h-4 ${iconColor}`} />}
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded-md ${COLOR_CLASSES[color as keyof typeof COLOR_CLASSES]}`}
          >
            {label}
          </span>
        </div>
        <Badge variant={BADGE_VARIANT_MAP[color] || "gray"} size="sm">
          {showTotalCount ? `${tasks.length} / ${totalCount}` : tasks.length}
        </Badge>
      </div>

      <div
        ref={(node) => {
          setNodeRef(node);
          (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={`p-1.5 rounded-lg transition-all duration-200 flex-1 overflow-y-auto ${
          isOver
            ? "bg-indigo-50/80 border-2 border-dashed border-indigo-300"
            : "border-2 border-transparent"
        }`}
      >
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground text-center px-2">
            {hasActiveFilters ? "No tasks match filters" : "No tasks"}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} agents={agents} onClick={onTaskClick} />
            ))}
            {hasMore && (
              <div
                ref={loadMoreSentinelRef}
                className="flex items-center justify-center min-h-[44px] py-2"
              >
                {isLoadingMore && (
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading...
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
