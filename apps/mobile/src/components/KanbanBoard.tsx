import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useClient } from "urql";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KANBAN_BOARD_QUERY, LOAD_MORE_COLUMN_QUERY, UPDATE_TASK } from "@agentcenter/graphql-client";
import { PRIORITY_HEX_COLORS, STATUS_HEX_COLORS, TASK_STATUSES, PRIORITY_ICONS, PAGE_SIZE_KANBAN, DEFAULT_COLOR } from "@agentcenter/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface KanbanTask {
  id: string;
  title: string;
  taskNumber: number;
  priority: string | null;
  status: string;
  assignees?: { profile: { displayName: string } }[];
}

interface KanbanBoardData {
  inbox: KanbanTask[];
  assigned: KanbanTask[];
  in_progress: KanbanTask[];
  review: KanbanTask[];
  blocked: KanbanTask[];
  done: KanbanTask[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const KANBAN_COLUMNS = TASK_STATUSES.map((s) => ({
  key: s.id as keyof KanbanBoardData,
  label: s.label,
  color: STATUS_HEX_COLORS[s.id] ?? DEFAULT_COLOR,
}));

const COLUMN_WIDTH = 220;

// ── Kanban Task Card ──────────────────────────────────────────────────────────

function KanbanTaskCard({
  task,
  onPress,
  onLongPress,
}: {
  task: KanbanTask;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const priorityColor = task.priority ? (PRIORITY_HEX_COLORS[task.priority] ?? DEFAULT_COLOR) : null;
  const priorityIcon = task.priority ? (PRIORITY_ICONS[task.priority] ?? "") : null;

  return (
    <TouchableOpacity
      className="bg-white dark:bg-slate-800 rounded-lg p-2.5 border border-gray-200 dark:border-slate-700 gap-1.5"
      style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
      delayLongPress={400}
    >
      <View className="flex-row justify-between items-center">
        <Text className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">#{task.taskNumber}</Text>
        {priorityColor && (
          <Text style={{ color: priorityColor, fontSize: 13, fontWeight: "700" }}>
            {priorityIcon}
          </Text>
        )}
      </View>
      <Text className="text-[13px] text-gray-900 dark:text-slate-100 leading-[18px] font-medium" numberOfLines={3}>
        {task.title}
      </Text>
      {(task.assignees ?? []).length > 0 && (
        <Text className="text-[11px] text-gray-400 dark:text-slate-500" numberOfLines={1}>
          {task.assignees![0].profile.displayName}
          {task.assignees!.length > 1 ? ` +${task.assignees!.length - 1}` : ""}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

function Column({
  col,
  tasks,
  onTaskPress,
  onTaskMove,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  col: (typeof KANBAN_COLUMNS)[number];
  tasks: KanbanTask[];
  onTaskPress: (id: string) => void;
  onTaskMove: (task: KanbanTask) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <View
      className="bg-gray-100 dark:bg-slate-800/50 rounded-xl overflow-hidden"
      style={{ width: COLUMN_WIDTH, maxHeight: "100%" }}
    >
      <View
        className="flex-row items-center justify-between px-3 py-2.5 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700"
        style={{ borderTopWidth: 3, borderTopColor: col.color }}
      >
        <Text className="text-[13px] font-bold" style={{ color: col.color }}>{col.label}</Text>
        <View
          className="min-w-[22px] h-[22px] rounded-full justify-center items-center px-1.5"
          style={{ backgroundColor: col.color + "22" }}
        >
          <Text className="text-[12px] font-bold" style={{ color: col.color }}>{tasks.length}</Text>
        </View>
      </View>
      <ScrollView
        style={{ maxHeight: 600 }}
        contentContainerStyle={{ padding: 8, gap: 8 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {tasks.length === 0 ? (
          <View className="py-6 items-center">
            <Text className="text-[12px] text-gray-300 dark:text-slate-600">No tasks</Text>
          </View>
        ) : (
          tasks.map((task) => (
            <KanbanTaskCard
              key={task.id}
              task={task}
              onPress={() => onTaskPress(task.id)}
              onLongPress={() => onTaskMove(task)}
            />
          ))
        )}
        {hasMore && (
          <TouchableOpacity
            className="py-2 rounded-md border items-center mt-0.5"
            style={{ borderColor: col.color + "44" }}
            onPress={onLoadMore}
            disabled={loadingMore}
            activeOpacity={0.7}
          >
            {loadingMore ? (
              <ActivityIndicator size="small" color={col.color} />
            ) : (
              <Text className="text-[12px] font-semibold" style={{ color: col.color }}>Load more</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// ── KanbanBoard ───────────────────────────────────────────────────────────────

interface KanbanBoardProps {
  /** Omit to show all tasks across every project. */
  projectId?: string;
  /** Extra bottom padding (e.g. for FAB). */
  bottomPadding?: number;
  /** Server-side filter: only blocked tasks. */
  blockedOnly?: boolean;
  /** Server-side filter: only top-level tasks (no parent). */
  topLevelOnly?: boolean;
  /** Server-side filter: only tasks with no assignees. */
  unassignedOnly?: boolean;
  /** Server-side due-date filter: "overdue" | "today" | "this_week" | "no_due_date" */
  dueDateFilter?: string;
  /** Server-side priority filter: array of priority strings. */
  priorities?: string[];
}

export function KanbanBoard({
  projectId,
  bottomPadding = 0,
  blockedOnly,
  topLevelOnly,
  unassignedOnly,
  dueDateFilter,
  priorities,
}: KanbanBoardProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const client = useClient();

  const [extraTasks, setExtraTasksMap] = useState<Partial<Record<keyof KanbanBoardData, KanbanTask[]>>>({});
  const [loadingColumns, setLoadingColumns] = useState<Partial<Record<keyof KanbanBoardData, boolean>>>({});

  const [result, reexecute] = useQuery<KanbanBoardData>({
    query: KANBAN_BOARD_QUERY,
    variables: {
      projectId: projectId ?? null,
      blockedOnly: blockedOnly || undefined,
      topLevelOnly: topLevelOnly || undefined,
      unassignedOnly: unassignedOnly || undefined,
      dueDateFilter: dueDateFilter || undefined,
      priorities: priorities?.length ? priorities : undefined,
    },
    requestPolicy: "cache-and-network",
  });

  const [, updateTask] = useMutation(UPDATE_TASK);

  const { data, fetching, error } = result;
  const hasData = data != null;

  function moveTask(task: KanbanTask) {
    const targets = KANBAN_COLUMNS.filter((c) => c.key !== task.status);
    Alert.alert(
      `Move #${task.taskNumber}`,
      task.title.slice(0, 60),
      [
        ...targets.map((col) => ({
          text: col.label,
          onPress: () => doMoveTask(task, col.key),
        })),
        { text: "Cancel", style: "cancel" },
      ]
    );
  }

  async function doMoveTask(task: KanbanTask, newStatus: string) {
    const res = await updateTask({ id: task.id, status: newStatus });
    if (res.error) Alert.alert("Error", "Failed to move task");
  }

  async function loadMoreForColumn(colKey: keyof KanbanBoardData) {
    const currentBase = data?.[colKey] ?? [];
    const currentExtra = extraTasks[colKey] ?? [];
    const offset = currentBase.length + currentExtra.length;
    setLoadingColumns((prev) => ({ ...prev, [colKey]: true }));
    try {
      const res = await client.query(LOAD_MORE_COLUMN_QUERY, {
        status: colKey,
        limit: PAGE_SIZE_KANBAN,
        offset,
        projectId: projectId ?? null,
        blockedOnly: blockedOnly || undefined,
        topLevelOnly: topLevelOnly || undefined,
        unassignedOnly: unassignedOnly || undefined,
        dueDateFilter: dueDateFilter || undefined,
        priorities: priorities?.length ? priorities : undefined,
      }).toPromise();
      const newTasks: KanbanTask[] = res.data?.tasksByStatus ?? [];
      setExtraTasksMap((prev) => ({
        ...prev,
        [colKey]: [...(prev[colKey] ?? []), ...newTasks],
      }));
    } finally {
      setLoadingColumns((prev) => ({ ...prev, [colKey]: false }));
    }
  }

  if (fetching && !hasData) {
    return (
      <View className="flex-1 justify-center items-center gap-3">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && !hasData) {
    return (
      <View className="flex-1 justify-center items-center gap-3">
        <Text className="text-red-600 dark:text-red-400 text-base">Failed to load board</Text>
        <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })}>
          <Text className="text-blue-600 dark:text-blue-400 text-sm font-semibold">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          padding: 12,
          gap: 10,
          flexDirection: "row",
          alignItems: "flex-start",
          paddingBottom: insets.bottom + 16 + bottomPadding,
        }}
        refreshControl={
          <RefreshControl
            refreshing={fetching && hasData}
            onRefresh={() => {
              setExtraTasksMap({});
              reexecute({ requestPolicy: "network-only" });
            }}
            tintColor="#2563eb"
          />
        }
      >
        {KANBAN_COLUMNS.map((col) => {
          const baseTasks = data?.[col.key] ?? [];
          const extras = extraTasks[col.key] ?? [];
          const allTasks = [...baseTasks, ...extras];
          const hasMore = baseTasks.length + extras.length > 0 &&
            (baseTasks.length + extras.length) % PAGE_SIZE_KANBAN === 0;
          return (
            <Column
              key={col.key}
              col={col}
              tasks={allTasks}
              onTaskPress={(id) => router.push(`/task/${id}`)}
              onTaskMove={moveTask}
              hasMore={hasMore}
              loadingMore={loadingColumns[col.key] ?? false}
              onLoadMore={() => loadMoreForColumn(col.key)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
