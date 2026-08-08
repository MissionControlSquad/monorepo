"use client";

import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from "react";
import { useQuery, useSubscription, useClient } from "urql";
import {
  KANBAN_BOARD_QUERY,
  TASK_COUNTS_BY_STATUS_QUERY,
  LOAD_MORE_COLUMN_QUERY,
  AGENTS_QUERY,
} from "../../lib/graphql/queries";
import { TASK_UPDATED_SUBSCRIPTION } from "../../lib/graphql/subscriptions";
import { useCurrentProject } from "../context/AppContext";
import { useTaskList } from "../context/TaskListContext";
import { TASK_STATUSES } from "../../lib/constants";
import { KanbanColumn } from "./KanbanColumn";
import { StatusRow } from "./StatusRow";
import { FilterBar, type FilterState } from "./FilterBar";
import { FilterSidebar } from "./FilterSidebar";
import { Columns3, LayoutList } from "lucide-react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { Card } from "../ui";
import type { TaskCard as TaskCardType, TaskAssignee } from "@agentcenter/types";
import { matchesDueDateFilter } from "@agentcenter/utils";

const DndBoardWrapper = lazy(() => import("./DndBoardWrapper"));

type ViewMode = "columns" | "rows";

interface KanbanBoardProps {
  onTaskClick: (task: TaskCardType) => void;
}

const EMPTY_FILTERS: FilterState = {
  searchQuery: "",
  priorities: [],
  assigneeIds: [],
  tags: [],
  unassignedOnly: false,
  noProjectOnly: false,
  dueDateFilter: null,
  blockedOnly: false,
  topLevelOnly: false,
};

/** Page size for "load more" when user scrolls to bottom (same as initial 50). */
const KANBAN_PAGE_SIZE = 50;

function filterTasks(tasks: TaskCardType[], filters: FilterState): TaskCardType[] {
  return tasks.filter((task) => {
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      if (!task.title.toLowerCase().includes(q)) return false;
    }
    if (filters.priorities.length > 0) {
      if (!task.priority || !filters.priorities.includes(task.priority)) return false;
    }
    if (!matchesDueDateFilter(task.dueDate, filters.dueDateFilter)) return false;
    if (filters.blockedOnly) {
      if (!task.blockedByTaskId) return false;
    }
    if (filters.topLevelOnly) {
      if (task.parentTaskId) return false;
    }
    if (filters.noProjectOnly) {
      if (task.projectId) return false;
    }
    if (filters.unassignedOnly) {
      if (task.assignees && task.assignees.length > 0) return false;
    }
    if (filters.assigneeIds.length > 0) {
      const taskAssigneeIds =
        task.assignees?.map((a: TaskAssignee) => a.profile?.agentId ?? a.profile?.agent?.id) ?? [];
      if (
        !taskAssigneeIds.some(
          (id: string | undefined | null) => id && filters.assigneeIds.includes(id),
        )
      )
        return false;
    }
    if (filters.tags.length > 0) {
      if (!task.tags?.some((tag: string) => filters.tags.includes(tag))) return false;
    }
    return true;
  });
}

interface ColumnState {
  tasks: TaskCardType[];
  offset: number;
  hasMore: boolean;
}

export function KanbanBoard({ onTaskClick }: KanbanBoardProps) {
  const { projectId } = useCurrentProject();
  const client = useClient();

  // No project selected or "All Projects" → omit projectId so server returns tasks from all projects
  const isAllProjects = !projectId || projectId === "all";

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  const hasActiveFilters =
    filters.searchQuery !== "" ||
    filters.priorities.length > 0 ||
    filters.assigneeIds.length > 0 ||
    filters.tags.length > 0 ||
    filters.unassignedOnly ||
    filters.noProjectOnly ||
    !!filters.dueDateFilter ||
    filters.blockedOnly ||
    filters.topLevelOnly;

  // Build server-side filter variables from current filter state (strip empty/default values)
  const filterVariables = useMemo(() => {
    const vars: Record<string, any> = {};
    if (filters.priorities.length > 0) vars.priorities = filters.priorities;
    if (filters.assigneeIds.length > 0) vars.assigneeIds = filters.assigneeIds;
    if (filters.unassignedOnly) vars.unassignedOnly = true;
    if (filters.tags.length > 0) vars.tags = filters.tags;
    if (filters.dueDateFilter) vars.dueDateFilter = filters.dueDateFilter;
    if (filters.blockedOnly) vars.blockedOnly = true;
    if (filters.topLevelOnly) vars.topLevelOnly = true;
    if (filters.noProjectOnly) vars.noProjectOnly = true;
    if (filters.searchQuery) vars.searchQuery = filters.searchQuery;
    return vars;
  }, [filters]);

  const boardVariables = useMemo(
    () => ({
      ...(isAllProjects ? {} : { projectId }),
      ...filterVariables,
    }),
    [isAllProjects, projectId, filterVariables],
  );

  const [boardResult] = useQuery({
    query: KANBAN_BOARD_QUERY,
    variables: boardVariables,
    requestPolicy: "cache-and-network",
  });
  const isLoadingBoard = boardResult.fetching && !boardResult.data;

  // Filtered counts — used for pagination (hasMore) and per-column totals
  const [countsResult] = useQuery({
    query: TASK_COUNTS_BY_STATUS_QUERY,
    variables: boardVariables,
    requestPolicy: "cache-and-network",
  });

  // Unfiltered counts — only fetched when filters are active, for "X of Y" display
  const projectOnlyVariables = useMemo(
    () => (isAllProjects ? {} : { projectId }),
    [isAllProjects, projectId],
  );
  const [unfilteredCountsResult] = useQuery({
    query: TASK_COUNTS_BY_STATUS_QUERY,
    variables: projectOnlyVariables,
    requestPolicy: "cache-and-network",
    pause: !hasActiveFilters,
  });

  // Build counts map from server response
  const countsMap = useMemo(() => {
    const map: Record<string, number> = {};
    const counts = countsResult.data?.taskCountsByStatus;
    if (counts) {
      for (const { status, count } of counts) {
        map[status] = count;
      }
    }
    return map;
  }, [countsResult.data?.taskCountsByStatus]);

  // Unfiltered total across all statuses
  const unfilteredTotal = useMemo(() => {
    const counts = unfilteredCountsResult.data?.taskCountsByStatus;
    if (!counts) return 0;
    return counts.reduce((sum: number, r: { count: number }) => sum + r.count, 0);
  }, [unfilteredCountsResult.data?.taskCountsByStatus]);

  // Per-column pagination state
  const [columnStates, setColumnStates] = useState<Record<string, ColumnState>>({});

  // Track whether a network fetch is still pending after a project switch.
  const [switchingProject, setSwitchingProject] = useState(false);

  // Track the last boardResult.data reference we applied, so we can detect fresh data
  const appliedDataRef = useRef<Record<string, TaskCardType[]> | null>(null);

  // Track recent subscription updates to avoid reinitializing columns from graphcache echoes
  const lastSubUpdateRef = useRef<number>(0);

  // Reset column states when project or filters change to avoid showing stale data
  const filterKey = JSON.stringify(filterVariables);
  useEffect(() => {
    setColumnStates({});
    setSwitchingProject(true);
    appliedDataRef.current = null;
  }, [projectId, filterKey]);

  // Initialize column states from board query data.
  // Runs on initial load, after project/filter switch, and whenever fresh network data arrives.
  // After init, columnStates is the sole source of truth, managed by subscription, DnD, and load-more.
  useEffect(() => {
    if (!boardResult.data) return;
    // While switching projects, wait for the network response (skip cached/stale data)
    if (switchingProject && boardResult.fetching) return;
    // Skip if we already applied this exact data reference (no new data from server)
    if (boardResult.data === appliedDataRef.current) return;
    // Skip graphcache echoes caused by subscription updates — the subscription handler
    // already applied the change locally, so reinitializing would cause tasks to flicker.
    if (Date.now() - lastSubUpdateRef.current < 2000 && !switchingProject) return;

    const data = boardResult.data;
    appliedDataRef.current = data;

    if (switchingProject) setSwitchingProject(false);

    const newStates: Record<string, ColumnState> = {};
    for (const status of TASK_STATUSES) {
      const tasks = data[status.id] ?? [];
      const totalCount = countsMap[status.id] ?? tasks.length;
      newStates[status.id] = {
        tasks,
        offset: tasks.length,
        hasMore: tasks.length < totalCount,
      };
    }
    setColumnStates(newStates);
  }, [boardResult.data, boardResult.fetching, switchingProject, countsMap]);

  // Track known task IDs so we can detect genuinely new tasks
  const knownTaskIds = useRef(new Set<string>());
  useEffect(() => {
    const allIds = new Set<string>();
    for (const col of Object.values(columnStates)) {
      for (const t of col.tasks) {
        allIds.add(t.id);
      }
    }
    knownTaskIds.current = allIds;
  }, [columnStates]);

  // When viewing all projects, subscription receives all task updates; when a project is selected, filter by it
  const subscriptionVariables = isAllProjects ? {} : { projectId: projectId! };
  // columnStates is the sole source of truth for kanban rendering.
  // The subscription handler manages all task updates locally:
  // - New tasks: inserted directly into the target column
  // - Status changes: moved between columns
  // - Field updates: merged in-place
  // This avoids the race condition where graphcache updates would trigger
  // boardResult.data changes that wipe paginated tasks.
  useSubscription(
    { query: TASK_UPDATED_SUBSCRIPTION, variables: subscriptionVariables },
    (_prev, data) => {
      const updated = data?.taskUpdated;
      if (!updated?.id || !updated.status) return data;

      // Mark that a subscription update is being applied so the board data
      // initialization effect skips the graphcache echo that follows.
      lastSubUpdateRef.current = Date.now();

      setColumnStates((prev) => {
        // Find which column currently holds the task
        let currentCol: string | null = null;
        for (const [colId, col] of Object.entries(prev)) {
          if (col.tasks.some((t: TaskCardType) => t.id === updated.id)) {
            currentCol = colId;
            break;
          }
        }

        if (!currentCol) {
          // Brand-new task — add to the target column at the top
          const targetCol = prev[updated.status];
          if (!targetCol) return prev;
          // Skip if somehow already present
          if (targetCol.tasks.some((t: TaskCardType) => t.id === updated.id)) return prev;
          return {
            ...prev,
            [updated.status]: {
              ...targetCol,
              tasks: [updated, ...targetCol.tasks],
              offset: targetCol.offset + 1,
            },
          };
        }

        if (currentCol === updated.status) {
          // Same column — update the task fields in place
          const col = prev[currentCol];
          return {
            ...prev,
            [currentCol]: {
              ...col,
              tasks: col.tasks.map((t: TaskCardType) =>
                t.id === updated.id ? { ...t, ...updated } : t,
              ),
            },
          };
        }

        // Move from old column to new column
        const fromCol = prev[currentCol];
        const toCol = prev[updated.status];
        if (!fromCol || !toCol) return prev;
        const task = fromCol.tasks.find((t: TaskCardType) => t.id === updated.id);
        return {
          ...prev,
          [currentCol]: {
            ...fromCol,
            tasks: fromCol.tasks.filter((t: TaskCardType) => t.id !== updated.id),
          },
          [updated.status]: {
            ...toCol,
            tasks: [
              { ...task, ...updated },
              ...toCol.tasks.filter((t: TaskCardType) => t.id !== updated.id),
            ],
          },
        };
      });
      return data;
    },
  );

  const [agentsResult] = useQuery({ query: AGENTS_QUERY });
  const agents = agentsResult.data?.agents;

  const [filterSidebarOpen, setFilterSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("columns");
  const [loadingColumns, setLoadingColumns] = useState<Set<string>>(new Set());

  const handleTaskMoved = useCallback(
    (
      taskId: string,
      fromStatus: string,
      toStatus: string,
      updatedTask: TaskCardType,
      insertAfterTaskId: string | null,
    ) => {
      setColumnStates((prev) => {
        const fromCol = prev[fromStatus];
        const toCol = prev[toStatus];
        if (!fromCol || !toCol) return prev;
        const fromTasks = fromCol.tasks.filter((t) => t.id !== taskId);
        // Dedupe so we never show the same task twice (e.g. if subscription already added it)
        const toList = toCol.tasks.filter((t) => t.id !== taskId);
        let insertIndex = toList.length;
        if (insertAfterTaskId != null) {
          const idx = toList.findIndex((t) => t.id === insertAfterTaskId);
          if (idx !== -1) insertIndex = idx + 1;
        }
        const toTasks = [
          ...toList.slice(0, insertIndex),
          updatedTask,
          ...toList.slice(insertIndex),
        ];
        return {
          ...prev,
          [fromStatus]: { ...fromCol, tasks: fromTasks },
          [toStatus]: { ...toCol, tasks: toTasks },
        };
      });
    },
    [],
  );

  const handleTaskMoveFailed = useCallback(
    (taskId: string, fromStatus: string, toStatus: string, task: TaskCardType) => {
      setColumnStates((prev) => {
        const fromCol = prev[fromStatus];
        const toCol = prev[toStatus];
        if (!fromCol || !toCol) return prev;
        const toTasks = toCol.tasks.filter((t) => t.id !== taskId);
        const fromTasks = [...fromCol.tasks, task];
        return {
          ...prev,
          [fromStatus]: { ...fromCol, tasks: fromTasks },
          [toStatus]: { ...toCol, tasks: toTasks },
        };
      });
    },
    [],
  );

  const isMobile = useMediaQuery("(max-width: 767px)");
  useEffect(() => {
    setViewMode(isMobile ? "rows" : "columns");
  }, [isMobile]);

  const allTasks = useMemo(() => {
    return Object.values(columnStates).flatMap((col) => col.tasks);
  }, [columnStates]);

  const statusIds = useMemo(() => TASK_STATUSES.map((s) => s.id), []);
  const taskIdToStatus = useMemo(() => {
    const map = new Map<string, string>();
    for (const status of TASK_STATUSES) {
      const tasks = columnStates[status.id]?.tasks ?? [];
      for (const task of tasks) {
        map.set(task.id, status.id);
      }
    }
    return map;
  }, [columnStates]);

  // Keep tags stable: accumulate from all loads, reset baseline when unfiltered
  const stableTagsRef = useRef<string[]>([]);
  const allTags = useMemo(() => {
    // eslint-disable-next-line react-hooks/refs -- seeds accumulation from a ref only ever written (in the effect below) to equal this memo's own output, so the read is stable; react-hooks/refs false positive
    const tagSet = new Set<string>(stableTagsRef.current);
    for (const task of allTasks) {
      task.tags?.forEach((tag: string) => tagSet.add(tag));
    }
    return Array.from(tagSet).sort();
  }, [allTasks]);

  useEffect(() => {
    if (!hasActiveFilters) {
      stableTagsRef.current = allTags;
    }
  }, [allTags, hasActiveFilters]);

  // Server already returns filtered results; client-side filterTasks catches
  // subscription-delivered tasks that no longer match the active filters.
  const filteredByStatus = useMemo(() => {
    if (Object.keys(columnStates).length === 0) return null;
    const result: Record<string, TaskCardType[]> = {};
    for (const status of TASK_STATUSES) {
      const tasks = columnStates[status.id]?.tasks ?? [];
      result[status.id] = hasActiveFilters ? filterTasks(tasks, filters) : tasks;
    }
    return result;
  }, [columnStates, filters, hasActiveFilters]);

  // Dedupe within each column to avoid duplicate key warnings.
  // Column placement in columnStates is the source of truth (managed by subscription handler + drag-and-drop).
  const statusData = useMemo(() => {
    const raw = filteredByStatus || {};
    return TASK_STATUSES.map((status) => {
      const rawTasks = raw[status.id] ?? [];
      const seenIds = new Set<string>();
      const tasks = rawTasks.filter((t: TaskCardType) => {
        if (seenIds.has(t.id)) return false;
        seenIds.add(t.id);
        return true;
      });
      return {
        ...status,
        tasks,
        totalCount: countsMap[status.id] ?? columnStates[status.id]?.tasks.length ?? 0,
        hasMore: columnStates[status.id]?.hasMore ?? false,
      };
    });
  }, [filteredByStatus, countsMap, columnStates]);

  // Sync ordered task list to context for prev/next navigation in task detail modal
  const taskListCtx = useTaskList();
  const setTaskRefs = taskListCtx?.setTaskRefs;
  const taskIdsKey = statusData.flatMap((s) => s.tasks.map((t: TaskCardType) => t.id)).join(",");
  useEffect(() => {
    if (!setTaskRefs) return;
    const refs = statusData.flatMap((s) =>
      s.tasks.map((t: TaskCardType) => ({ id: t.id, taskNumber: t.taskNumber })),
    );
    setTaskRefs(refs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIdsKey, setTaskRefs]);

  // Load more callback per column
  const handleLoadMore = useCallback(
    async (status: string) => {
      const col = columnStates[status];
      if (!col || !col.hasMore) return;

      setLoadingColumns((prev) => new Set(prev).add(status));

      const result = await client
        .query(LOAD_MORE_COLUMN_QUERY, {
          status,
          limit: KANBAN_PAGE_SIZE,
          offset: col.offset,
          ...(isAllProjects ? {} : { projectId: projectId! }),
          ...filterVariables,
        })
        .toPromise();

      const newTasks = result.data?.tasksByStatus ?? [];
      const totalCount = countsMap[status] ?? 0;

      setColumnStates((prev) => {
        const existing = prev[status];
        if (!existing) return prev;
        const merged = [...existing.tasks, ...newTasks];
        return {
          ...prev,
          [status]: {
            tasks: merged,
            offset: merged.length,
            hasMore: merged.length < totalCount,
          },
        };
      });

      setLoadingColumns((prev) => {
        const next = new Set(prev);
        next.delete(status);
        return next;
      });
    },
    [columnStates, client, projectId, countsMap, isAllProjects, filterVariables],
  );

  if (isLoadingBoard || switchingProject || Object.keys(columnStates).length === 0 || !agents) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i}>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-4 w-4 bg-muted rounded-md" />
              <div className="h-5 w-24 bg-muted rounded-md" />
              <div className="h-5 w-5 bg-muted rounded-md" />
            </div>
            <div className="grid grid-cols-1 @xl:grid-cols-2 @3xl:grid-cols-3 gap-3">
              {[1, 2, 3].map((j) => (
                <Card key={j} padding="md" className="space-y-3">
                  <div className="flex justify-between">
                    <div className="h-4 bg-muted rounded w-2/3" />
                    <div className="flex -space-x-1">
                      <div className="w-6 h-6 bg-muted rounded-full" />
                    </div>
                  </div>
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Filtered total from server counts; unfiltered total from separate query
  const filteredTotal = Object.values(countsMap).reduce((sum, c) => sum + c, 0);

  const boardContent = (
    <div className="flex flex-col h-full">
      {/* Filter bar + view toggle */}
      <div className="flex items-center gap-2 px-3 @xl:px-4 pt-3 @xl:pt-4 pb-1">
        <div className="flex-1 min-w-0">
          <FilterBar
            filters={filters}
            onFiltersChange={setFilters}
            agents={agents}
            onOpenFilters={() => setFilterSidebarOpen(true)}
          />
        </div>

        {/* Filtered count */}
        {hasActiveFilters && unfilteredTotal > 0 && (
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            {filteredTotal} of {unfilteredTotal}
          </span>
        )}

        {/* View toggle */}
        <div className="flex items-center bg-muted rounded-lg p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode("rows")}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === "rows"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Row view"
          >
            <LayoutList className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("columns")}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === "columns"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Column view"
          >
            <Columns3 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === "rows" ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-1">
          {statusData.map((status) => (
            <StatusRow
              key={status.id}
              id={status.id}
              label={status.label}
              color={status.color}
              tasks={status.tasks}
              totalCount={status.totalCount}
              hasMore={status.hasMore}
              onLoadMore={() => handleLoadMore(status.id)}
              isLoadingMore={loadingColumns.has(status.id)}
              agents={agents}
              onTaskClick={onTaskClick}
              hasActiveFilters={hasActiveFilters}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex gap-3 px-4 py-3 overflow-x-auto flex-1 min-h-0">
            {statusData.map((status) => (
              <KanbanColumn
                key={status.id}
                id={status.id}
                label={status.label}
                color={status.color}
                tasks={status.tasks}
                totalCount={status.totalCount}
                hasMore={status.hasMore}
                onLoadMore={() => handleLoadMore(status.id)}
                isLoadingMore={loadingColumns.has(status.id)}
                agents={agents}
                onTaskClick={onTaskClick}
                hasActiveFilters={hasActiveFilters}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Suspense fallback={boardContent}>
        <DndBoardWrapper
          agents={agents}
          onTaskClick={onTaskClick}
          statusIds={statusIds}
          taskIdToStatus={taskIdToStatus}
          onTaskMoved={handleTaskMoved}
          onTaskMoveFailed={handleTaskMoveFailed}
        >
          {boardContent}
        </DndBoardWrapper>
      </Suspense>

      <FilterSidebar
        isOpen={filterSidebarOpen}
        onClose={() => setFilterSidebarOpen(false)}
        filters={filters}
        onFiltersChange={setFilters}
        agents={agents}
        allTags={allTags}
        projectId={projectId ?? null}
      />
    </>
  );
}
