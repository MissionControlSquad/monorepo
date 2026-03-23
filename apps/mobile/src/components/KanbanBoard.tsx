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
import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { getStoredCookie } from "../api/session";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KanbanTask {
  id: string;
  title: string;
  taskNumber: number;
  priority: string | null;
  status: string;
  assignees?: { profile: { displayName: string; identityEmoji?: string | null } }[];
}

export interface BoardData {
  inbox: KanbanTask[];
  assigned: KanbanTask[];
  in_progress: KanbanTask[];
  review: KanbanTask[];
  done: KanbanTask[];
  blocked: KanbanTask[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const KANBAN_COLUMNS: { key: keyof BoardData; label: string; color: string }[] = [
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

const PRIORITY_COLORS: Record<string, string> = {
  low: "#6b7280",
  medium: "#d97706",
  high: "#dc2626",
  urgent: "#7c3aed",
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
  const priorityColor = task.priority ? (PRIORITY_COLORS[task.priority] ?? "#6b7280") : null;
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
}: {
  col: (typeof KANBAN_COLUMNS)[number];
  tasks: KanbanTask[];
  onTaskPress: (id: string) => void;
  onTaskMove: (task: KanbanTask) => void;
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
}

export function KanbanBoard({ projectId, bottomPadding = 0 }: KanbanBoardProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { serverUrl } = useAuth();

  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBoard();
  }, [projectId, serverUrl]);

  async function fetchBoard(isRefresh = false) {
    if (!serverUrl) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const cookie = getStoredCookie();
      const qs = projectId ? `?projectId=${projectId}` : "";
      const res = await fetch(`${serverUrl}/api/tasks/board${qs}`, {
        headers: cookie ? { Cookie: `mc_session=${cookie}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBoard(await res.json());
    } catch {
      setError("Failed to load board");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

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
    if (!serverUrl) return;
    // Optimistic update
    setBoard((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      (Object.keys(next) as (keyof BoardData)[]).forEach((k) => {
        next[k] = next[k].filter((t) => t.id !== task.id);
      });
      const col = newStatus as keyof BoardData;
      if (next[col]) next[col] = [{ ...task, status: newStatus }, ...next[col]];
      return next;
    });

    try {
      const cookie = getStoredCookie();
      const res = await fetch(`${serverUrl}/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: `mc_session=${cookie}` } : {}),
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        Alert.alert("Error", "Failed to move task");
        fetchBoard();
      }
    } catch {
      Alert.alert("Error", "Network error");
      fetchBoard();
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error || !board) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? "Unknown error"}</Text>
        <TouchableOpacity onPress={() => fetchBoard()}>
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
            refreshing={refreshing}
            onRefresh={() => fetchBoard(true)}
            tintColor="#2563eb"
          />
        }
      >
        {KANBAN_COLUMNS.map((col) => (
          <Column
            key={col.key}
            col={col}
            tasks={board[col.key] ?? []}
            onTaskPress={(id) => router.push(`/task/${id}`)}
            onTaskMove={moveTask}
          />
        ))}
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
