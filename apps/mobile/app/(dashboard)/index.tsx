import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useQuery } from "urql";
import { useRouter } from "expo-router";
import { TASKS_QUERY } from "../../src/lib/graphql/queries";
import type { TaskStatus, Priority } from "../../src/types";

interface TaskAssignee {
  id: string;
  profileId: string;
  profile: { id: string; displayName: string; username: string; avatarUrl: string | null };
}

interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority | null;
  taskNumber: number;
  dueDate: string | null;
  tags: string[];
  assignees: TaskAssignee[];
}

const STATUS_COLORS: Record<string, string> = {
  inbox: "#6b7280",
  assigned: "#2563eb",
  in_progress: "#d97706",
  review: "#7c3aed",
  done: "#16a34a",
  blocked: "#dc2626",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#6b7280",
  medium: "#d97706",
  high: "#dc2626",
  urgent: "#7c3aed",
};

function statusLabel(status: string): string {
  return status.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TaskListScreen() {
  const router = useRouter();
  const [result, reexecute] = useQuery<{ tasks: Task[] }>({
    query: TASKS_QUERY,
    variables: { limit: 100 },
    requestPolicy: "cache-and-network",
  });

  const { data, fetching, error } = result;
  const tasks = data?.tasks ?? [];

  if (fetching && tasks.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && tasks.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load tasks</Text>
        <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={tasks.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={fetching}
            onRefresh={() => reexecute({ requestPolicy: "network-only" })}
            tintColor="#2563eb"
          />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No tasks yet</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/task/${item.id}`)}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.taskNumber}>#{item.taskNumber}</Text>
              {item.priority && (
                <View
                  style={[
                    styles.priorityBadge,
                    { backgroundColor: PRIORITY_COLORS[item.priority] + "22" },
                  ]}
                >
                  <Text
                    style={[styles.priorityText, { color: PRIORITY_COLORS[item.priority] }]}
                  >
                    {item.priority}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.taskTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.cardFooter}>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: STATUS_COLORS[item.status] + "22" },
                ]}
              >
                <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
                  {statusLabel(item.status)}
                </Text>
              </View>
              {item.assignees.length > 0 && (
                <Text style={styles.assignees} numberOfLines={1}>
                  {item.assignees.map((a) => a.profile.displayName).join(", ")}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    gap: 12,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "#9ca3af",
    fontSize: 16,
  },
  errorText: {
    color: "#dc2626",
    fontSize: 16,
  },
  retryText: {
    color: "#2563eb",
    fontSize: 14,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  taskNumber: {
    fontSize: 12,
    color: "#9ca3af",
    fontWeight: "500",
  },
  priorityBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  assignees: {
    fontSize: 12,
    color: "#6b7280",
    flex: 1,
    textAlign: "right",
  },
});
