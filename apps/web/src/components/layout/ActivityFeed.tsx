"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useSubscription } from "urql";
import { ACTIVITIES_CONNECTION_QUERY } from "../../lib/graphql/queries";
import { ACTIVITY_CREATED_SUBSCRIPTION } from "../../lib/graphql/subscriptions";
import { useAppContext } from "../context/AppContext";
import { Activity, X, Filter, Coffee, Bot, User, Loader2 } from "lucide-react";
import { MarkdownWithMentions } from "../common/MarkdownWithMentions";
import { CopyButton } from "../common/CopyButton";
import { TimeAgo } from "../common/TimeAgo";
import { Button } from "../ui";
import { ProfileAvatar } from "../ui/ProfileAvatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import type { Activity as ActivityType } from "@agentcenter/types";
import { appendDeduped, prependDeduped } from "@agentcenter/utils";

const PAGE_SIZE = 30;

interface ActivityFeedProps {
  onTaskClick?: (taskId: string) => void;
  onClose?: () => void;
}

export function ActivityFeed({ onTaskClick, onClose }: ActivityFeedProps) {
  const { projectId } = useAppContext();

  // Accumulated activities across pages
  const [allActivities, setAllActivities] = useState<ActivityType[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [result] = useQuery({
    query: ACTIVITIES_CONNECTION_QUERY,
    variables: {
      first: PAGE_SIZE,
      after: cursor ?? undefined,
      projectId: projectId ?? undefined,
    },
    requestPolicy: "cache-and-network",
  });

  const isLoadingFirst = !cursor && result.fetching && allActivities.length === 0;

  // When query data arrives, append to accumulated list
  useEffect(() => {
    const connection = result.data?.activitiesConnection;
    if (!connection) return;

    setHasMore(connection.hasMore);
    setLoadingMore(false);

    setAllActivities((prev) => {
      if (!cursor) {
        // First page — replace
        return connection.activities;
      }
      // Subsequent pages — append, dedup by id
      return appendDeduped(prev, connection.activities);
    });
  }, [result.data?.activitiesConnection, cursor]);

  // Subscribe to new activities and prepend them
  const [subResult] = useSubscription({
    query: ACTIVITY_CREATED_SUBSCRIPTION,
    variables: { projectId: projectId ?? undefined },
  });

  useEffect(() => {
    const newActivity = subResult.data?.activityCreated;
    if (!newActivity) return;
    setAllActivities((prev) => prependDeduped(prev, [newActivity]));
  }, [subResult.data?.activityCreated]);

  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");

  // Collect unique profiles from activities for the filter dropdown
  const profiles = useMemo(() => {
    const map = new Map<string, { id: string; displayName: string }>();
    for (const a of allActivities) {
      if (a.profile && !map.has(a.profile.id)) {
        map.set(a.profile.id, { id: a.profile.id, displayName: a.profile.displayName });
      }
    }
    return Array.from(map.values());
  }, [allActivities]);

  // Collect unique tasks from activities for the filter dropdown
  const tasks = useMemo(() => {
    const map = new Map<string, { id: string; title: string; taskNumber?: number }>();
    for (const a of allActivities) {
      if (a.task && !map.has(a.task.id)) {
        map.set(a.task.id, {
          id: a.task.id,
          title: a.task.title,
          taskNumber: a.task.taskNumber ?? undefined,
        });
      }
    }
    return Array.from(map.values());
  }, [allActivities]);

  // Filter activities based on selected filters
  const filteredActivities = useMemo(() => {
    let filtered = allActivities;

    if (selectedProfileId) {
      filtered = filtered.filter(
        (activity: ActivityType) => activity.profileId === selectedProfileId,
      );
    }

    if (selectedTaskId) {
      filtered = filtered.filter((activity: ActivityType) => activity.taskId === selectedTaskId);
    }

    return filtered;
  }, [allActivities, selectedProfileId, selectedTaskId]);

  const hasActiveFilters = selectedProfileId || selectedTaskId;

  const clearFilters = () => {
    setSelectedProfileId("");
    setSelectedTaskId("");
  };

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || allActivities.length === 0) return;
    const lastId = allActivities[allActivities.length - 1]?.id;
    if (!lastId) return;
    setLoadingMore(true);
    setCursor(lastId);
  }, [loadingMore, hasMore, allActivities]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Activity Feed</h2>
            {filteredActivities.length > 0 && (
              <span className="text-xs text-muted-foreground">({filteredActivities.length})</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="xs"
                onClick={clearFilters}
                className="text-blue-600 hover:text-blue-700"
              >
                <X className="w-3 h-3" />
                <span>Clear</span>
              </Button>
            )}
            {onClose && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                className="lg:hidden text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label="Close activity feed"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-2">
          {/* Profile Filter */}
          <div className="relative">
            <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none z-10" />
            <Select
              value={selectedProfileId || "__all__"}
              onValueChange={(v) => setSelectedProfileId(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="w-full pl-8" aria-label="Filter by profile">
                <SelectValue placeholder="All Members" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Members</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Task Filter */}
          <div className="relative">
            <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none z-10" />
            <Select
              value={selectedTaskId || "__all__"}
              onValueChange={(v) => setSelectedTaskId(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="w-full pl-8" aria-label="Filter by task">
                <SelectValue placeholder="All Tasks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Tasks</SelectItem>
                {tasks.map((task) => {
                  const prefix = task.taskNumber ? `#${task.taskNumber} ` : "";
                  const label = `${prefix}${task.title}`;
                  return (
                    <SelectItem key={task.id} value={task.id}>
                      {label.length > 45 ? `${label.substring(0, 45)}...` : label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <ActivityList
        isLoadingFirst={isLoadingFirst}
        filteredActivities={filteredActivities}
        hasActiveFilters={!!hasActiveFilters}
        clearFilters={clearFilters}
        onTaskClick={onTaskClick}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}

function ActivityList({
  isLoadingFirst,
  filteredActivities,
  hasActiveFilters,
  clearFilters,
  onTaskClick,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  isLoadingFirst: boolean;
  filteredActivities: ActivityType[];
  hasActiveFilters: boolean;
  clearFilters: () => void;
  onTaskClick?: (taskId: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
          onLoadMore();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  if (isLoadingFirst) {
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-muted rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (filteredActivities.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-8 text-center">
        {hasActiveFilters ? (
          <>
            <Activity className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              No activities match the selected filters
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="mt-3 text-primary hover:text-primary/80"
            >
              Clear filters
            </Button>
          </>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <Coffee className="w-8 h-8 text-primary/70" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">All quiet on the front</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Activity will show up here once agents start checking in and working on tasks.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {filteredActivities.map((activity) => (
        <ActivityItem key={activity.id} activity={activity} onTaskClick={onTaskClick} />
      ))}

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-1" />

      {loadingMore && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="ml-2 text-xs text-muted-foreground">Loading more...</span>
        </div>
      )}
    </div>
  );
}

export const formatChangeValue = (value: unknown): string => {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    return value.length > 50 ? `${value.substring(0, 50)}…` : value;
  }
  if (Array.isArray(value)) return value.length === 0 ? "none" : value.join(", ");
  return String(value);
};

export const formatFieldName = (field: string): string => {
  const labels: Record<string, string> = {
    title: "Title",
    description: "Description",
    priority: "Priority",
    dueDate: "Due date",
    tags: "Tags",
    parentTaskId: "Parent task",
    blockedByTaskId: "Blocked by",
    status: "Status",
    assignees: "Assignees",
  };
  return labels[field] ?? field.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
};

export function ActivityChanges({
  changes,
}: {
  changes: Array<{
    field: string;
    from?: unknown;
    to?: unknown;
    added?: unknown;
    removed?: unknown;
  }>;
}) {
  return (
    <div className="mt-1 space-y-0.5">
      {changes.map((change, i) => (
        <div key={i} className="text-[11px] text-muted-foreground leading-snug">
          <span className="font-medium text-muted-foreground">{formatFieldName(change.field)}</span>
          {": "}
          {change.field === "assignees" && (change.added || change.removed) ? (
            <>
              {Array.isArray(change.added) && change.added.length > 0 && (
                <span className="text-emerald-600">+{(change.added as string[]).join(", ")}</span>
              )}
              {Array.isArray(change.added) &&
                change.added.length > 0 &&
                Array.isArray(change.removed) &&
                change.removed.length > 0 &&
                ", "}
              {Array.isArray(change.removed) && change.removed.length > 0 && (
                <span className="text-destructive">-{(change.removed as string[]).join(", ")}</span>
              )}
            </>
          ) : (
            <>
              <span className="text-muted-foreground">{formatChangeValue(change.from)}</span>
              {" → "}
              <span className="text-foreground">{formatChangeValue(change.to)}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function ActivityItem({
  activity,
  onTaskClick,
}: {
  activity: ActivityType;
  onTaskClick?: (taskId: string) => void;
}) {
  const profile = activity.profile ?? null;
  const isClickable = activity.taskId && onTaskClick;

  return (
    <div
      className={`group/activity relative px-3 py-2.5 border-b border-border hover:bg-muted transition ${isClickable ? "cursor-pointer" : ""}`}
      onClick={isClickable ? () => onTaskClick(activity.taskId!) : undefined}
    >
      <div className="flex items-start gap-2.5">
        {profile ? (
          <ProfileAvatar profileId={profile.id} size="sm+" />
        ) : (
          <div className="w-7 h-7 bg-muted rounded-full flex items-center justify-center shrink-0">
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {profile && (
            <div className="flex items-center gap-1">
              {profile.agentId ? (
                <Bot className="w-3 h-3 text-primary/70 shrink-0" />
              ) : (
                <User className="w-3 h-3 text-emerald-400 shrink-0" />
              )}
              <span className="text-xs font-medium text-foreground">{profile.displayName}</span>
            </div>
          )}
          <TimeAgo date={activity.createdAt} className="text-[10px] text-muted-foreground" />
          <MarkdownWithMentions
            content={activity.message ?? ""}
            className="text-sm break-words mt-0.5"
          />
          {Array.isArray(activity.metadata?.changes) && (
            <ActivityChanges
              changes={
                activity.metadata!.changes as Array<{
                  field: string;
                  from?: unknown;
                  to?: unknown;
                  added?: unknown;
                  removed?: unknown;
                }>
              }
            />
          )}
        </div>
      </div>
      <div className="absolute top-2 right-2 opacity-0 group-hover/activity:opacity-100 transition-opacity">
        <CopyButton text={activity.message ?? ""} />
      </div>
    </div>
  );
}
