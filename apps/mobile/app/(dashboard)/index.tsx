import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useQuery } from "urql";
import { useRouter } from "expo-router";
import { useState } from "react";
import { TASKS_QUERY } from "@agentcenter/graphql-client";
import { TaskCard } from "../../src/components/TaskCard";

interface TaskAssignee {
  id: string;
  profileId: string;
  profile: { id: string; displayName: string; username: string; avatarUrl: string | null };
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  taskNumber: number;
  dueDate: string | null;
  tags: string[];
  assignees: TaskAssignee[];
  project: { id: string; name: string } | null;
}

type StatusFilter = "all" | "inbox" | "in_progress" | "review" | "done" | "blocked";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "inbox", label: "Inbox" },
  { key: "in_progress", label: "In Progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
  { key: "blocked", label: "Blocked" },
];

export default function TaskListScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>("all");

  const [result, reexecute] = useQuery<{ tasks: Task[] }>({
    query: TASKS_QUERY,
    variables: { limit: 200 },
    requestPolicy: "cache-and-network",
  });

  const { data, fetching, error } = result;
  const allTasks = data?.tasks ?? [];
  const tasks = filter === "all" ? allTasks : allTasks.filter((t) => t.status === filter);

  if (fetching && allTasks.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && allTasks.length === 0) {
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
      {/* Status filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterContent}
      >
        {FILTERS.map((f) => {
          const count = f.key === "all" ? allTasks.length : allTasks.filter((t) => t.status === f.key).length;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.chip, filter === f.key && styles.chipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
                {f.label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.listContent,
          tasks.length === 0 && styles.emptyContainer,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={fetching && allTasks.length > 0}
            onRefresh={() => reexecute({ requestPolicy: "network-only" })}
            tintColor="#2563eb"
          />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {filter === "all" ? "No tasks yet" : `No ${filter.replace("_", " ")} tasks`}
          </Text>
        }
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            onPress={() => router.push(`/task/${item.id}`)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f9fafb", gap: 12 },
  errorText: { color: "#dc2626", fontSize: 16 },
  retryText: { color: "#2563eb", fontSize: 14, fontWeight: "600" },

  filterBar: { maxHeight: 48, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  filterContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: "row" },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: "#f3f4f6" },
  chipActive: { backgroundColor: "#dbeafe" },
  chipText: { fontSize: 13, color: "#6b7280", fontWeight: "500" },
  chipTextActive: { color: "#2563eb", fontWeight: "600" },

  listContent: { padding: 16, gap: 10 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { color: "#9ca3af", fontSize: 16 },
});
