import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useQuery, useMutation } from "urql";
import { useEffect } from "react";
import { TASK_QUERY } from "../../src/lib/graphql/queries";
import { UPDATE_TASK } from "../../src/lib/graphql/mutations";

interface Profile {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
}

interface TaskAssignee {
  id: string;
  profileId: string;
  assignedAt: string | null;
  profile: Profile & { agentId: string | null; agent: { id: string; name: string; identityEmoji: string | null; status: string } | null };
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  taskNumber: number;
  dueDate: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  parentTaskId: string | null;
  projectId: string | null;
  createdByProfile: Profile | null;
  parentTask: { id: string; title: string; taskNumber: number; status: string } | null;
  project: { id: string; name: string } | null;
  assignees: TaskAssignee[];
}

const TASK_STATUSES = ["inbox", "assigned", "in_progress", "review", "done", "blocked"];

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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  const [result, reexecute] = useQuery<{ task: Task | null }>({
    query: TASK_QUERY,
    variables: { id },
    requestPolicy: "cache-and-network",
  });

  const [, executeUpdate] = useMutation(UPDATE_TASK);

  const { data, fetching, error } = result;
  const task = data?.task;

  useEffect(() => {
    if (task) {
      navigation.setOptions({ title: `#${task.taskNumber}` });
    }
  }, [task, navigation]);

  const handleStatusChange = () => {
    if (!task) return;
    const current = TASK_STATUSES.indexOf(task.status);
    const options = TASK_STATUSES.map((s) => ({
      text: statusLabel(s),
      onPress: async () => {
        const res = await executeUpdate({ id: task.id, status: s });
        if (res.error) Alert.alert("Error", "Failed to update status");
        else reexecute({ requestPolicy: "network-only" });
      },
    }));
    Alert.alert("Change Status", undefined, [
      ...options,
      { text: "Cancel", style: "cancel" },
    ]);
  };

  if (fetching && !task) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if ((error && !task) || !task) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Task not found</Text>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[task.status] ?? "#6b7280";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Title */}
      <Text style={styles.title}>{task.title}</Text>

      {/* Meta row */}
      <View style={styles.metaRow}>
        <TouchableOpacity
          style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}
          onPress={handleStatusChange}
          activeOpacity={0.7}
        >
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabel(task.status)}
          </Text>
        </TouchableOpacity>
        {task.priority && (
          <View
            style={[
              styles.priorityBadge,
              { backgroundColor: (PRIORITY_COLORS[task.priority] ?? "#6b7280") + "22" },
            ]}
          >
            <Text
              style={[
                styles.priorityText,
                { color: PRIORITY_COLORS[task.priority] ?? "#6b7280" },
              ]}
            >
              {task.priority}
            </Text>
          </View>
        )}
        {task.project && <Text style={styles.projectName}>{task.project.name}</Text>}
      </View>

      {/* Description */}
      {task.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Description</Text>
          <Text style={styles.description}>{task.description}</Text>
        </View>
      ) : null}

      {/* Assignees */}
      {task.assignees.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Assignees</Text>
          {task.assignees.map((a) => (
            <View key={a.id} style={styles.assigneeRow}>
              <Text style={styles.assigneeEmoji}>
                {a.profile.agent?.identityEmoji ?? "👤"}
              </Text>
              <Text style={styles.assigneeName}>{a.profile.displayName}</Text>
              {a.profile.agent && (
                <Text style={styles.assigneeStatus}>{a.profile.agent.status}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Details */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Details</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailKey}>Due Date</Text>
          <Text style={styles.detailValue}>{formatDate(task.dueDate)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailKey}>Created</Text>
          <Text style={styles.detailValue}>{formatDate(task.createdAt)}</Text>
        </View>
        {task.createdByProfile && (
          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Created by</Text>
            <Text style={styles.detailValue}>{task.createdByProfile.displayName}</Text>
          </View>
        )}
        {task.parentTask && (
          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Parent Task</Text>
            <Text style={styles.detailValue}>
              #{task.parentTask.taskNumber} {task.parentTask.title}
            </Text>
          </View>
        )}
      </View>

      {/* Tags */}
      {task.tags.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Tags</Text>
          <View style={styles.tagsRow}>
            {task.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  content: {
    padding: 20,
    gap: 20,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 28,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
  },
  priorityBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  priorityText: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  projectName: {
    fontSize: 13,
    color: "#6b7280",
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
  },
  assigneeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  assigneeEmoji: {
    fontSize: 18,
  },
  assigneeName: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "500",
    flex: 1,
  },
  assigneeStatus: {
    fontSize: 12,
    color: "#6b7280",
    textTransform: "capitalize",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  detailKey: {
    fontSize: 14,
    color: "#6b7280",
    width: 100,
  },
  detailValue: {
    fontSize: 14,
    color: "#111827",
    flex: 1,
    textAlign: "right",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    backgroundColor: "#eff6ff",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 12,
    color: "#2563eb",
    fontWeight: "500",
  },
  errorText: {
    color: "#dc2626",
    fontSize: 16,
  },
});
