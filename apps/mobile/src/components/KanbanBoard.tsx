import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useClient } from "urql";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KANBAN_BOARD_QUERY, LOAD_MORE_COLUMN_QUERY, UPDATE_TASK } from "@agentcenter/graphql-client";
import { PRIORITY_HEX_COLORS } from "@agentcenter/utils";

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

const KANBAN_COLUMNS: { key: keyof KanbanBoardData; label: string; color: string }[] = [
  { key: "inbox", label: "Inbox", color: "#6b7280" },
  { key: "assigned", label: "Assigned", color: "#2563eb" },
  { key: "in_progress", label: "In Progress", color: "#d97706" },
  { key: "review", label: "Review", color: "#7c3aed" },
  { key: "done", label: "Done", color: "#16a34a" },
  { key: "blocked", label: "Blocked", color: "#dc2626" },
];

const PRIORITY_ICONS: Record<string, string> = {
  low: "↓",
  medium: "→",
  high: "↑",
  urgent: "⚡",
};

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
  const priorityColor = task.priority ? (PRIORITY_HEX_COLORS[task.priority] ?? "#6b7280") : null;
  const priorityIcon = task.priority ? (PRIORITY_ICONS[task.priority] ?? "") : null;

  return (
    <TouchableOpacity
      style={styles.taskCard}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
      delayLongPress={400}
    >
      <View style={styles.taskCardHeader}>
        <Text style={styles.taskNumber}>#{task.taskNumber}</Text>
        {priorityColor && (
          <Text style={[styles.priorityBadge, { color: priorityColor }]}>
            {priorityIcon}
          </Text>
        )}
      </View>
      <Text style={styles.taskTitle} numberOfLines={3}>
        {task.title}
      </Text>
      {(task.assignees ?? []).length > 0 && (
        <Text style={styles.assignee} numberOfLines={1}>
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
    <View style={styles.column}>
      <View style={[styles.columnHeader, { borderTopColor: col.color }]}>
        <Text style={[styles.columnTitle, { color: col.color }]}>{col.label}</Text>
        <View style={[styles.countBadge, { backgroundColor: col.color + "22" }]}>
          <Text style={[styles.countText, { color: col.color }]}>{tasks.length}</Text>
        </View>
      </View>
      <ScrollView
        style={styles.columnScroll}
        contentContainerStyle={styles.columnContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {tasks.length === 0 ? (
          <View style={styles.emptyColumn}>
            <Text style={styles.emptyColumnText}>No tasks</Text>
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
            style={[styles.loadMoreBtn, { borderColor: col.color + "44" }]}
            onPress={onLoadMore}
            disabled={loadingMore}
            activeOpacity={0.7}
          >
            {loadingMore ? (
              <ActivityIndicator size="small" color={col.color} />
            ) : (
              <Text style={[styles.loadMoreText, { color: col.color }]}>Load more</Text>
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

const KANBAN_PAGE_SIZE = 50;

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
        limit: KANBAN_PAGE_SIZE,
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && !hasData) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load board</Text>
        <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.boardContent,
          { paddingBottom: insets.bottom + 16 + bottomPadding },
        ]}
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
            (baseTasks.length + extras.length) % KANBAN_PAGE_SIZE === 0;
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

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  errorText: { color: "#dc2626", fontSize: 16 },
  retryText: { color: "#2563eb", fontSize: 14, fontWeight: "600" },

  boardContent: {
    padding: 12,
    gap: 10,
    flexDirection: "row",
    alignItems: "flex-start",
  },

  column: {
    width: COLUMN_WIDTH,
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    overflow: "hidden",
    maxHeight: "100%",
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 3,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  columnTitle: { fontSize: 13, fontWeight: "700" },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  countText: { fontSize: 12, fontWeight: "700" },

  columnScroll: { maxHeight: 600 },
  columnContent: { padding: 8, gap: 8 },

  emptyColumn: { paddingVertical: 24, alignItems: "center" },
  emptyColumnText: { fontSize: 12, color: "#d1d5db" },

  loadMoreBtn: {
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    marginTop: 2,
  },
  loadMoreText: { fontSize: 12, fontWeight: "600" },

  taskCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  taskCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  taskNumber: { fontSize: 11, color: "#9ca3af", fontWeight: "500" },
  priorityBadge: { fontSize: 13, fontWeight: "700" },
  taskTitle: { fontSize: 13, color: "#111827", lineHeight: 18, fontWeight: "500" },
  assignee: { fontSize: 11, color: "#9ca3af" },
});
