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
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ACTIVITIES_CONNECTION_QUERY } from "@agentcenter/graphql-client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivityProfile {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  agentId: string | null;
}

interface ActivityTask {
  id: string;
  title: string;
  taskNumber: number;
  status: string;
}

interface Activity {
  id: string;
  type: string;
  profileId: string;
  taskId: string | null;
  projectId: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  profile: ActivityProfile;
  task: ActivityTask | null;
}

interface ActivitiesConnection {
  activities: Activity[];
  hasMore: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  task_created: "add-circle-outline",
  task_updated: "pencil-outline",
  task_completed: "checkmark-circle",
  task_rejected: "close-circle",
  task_approved: "checkmark-done-circle",
  task_assigned: "person-add-outline",
  task_unassigned: "person-remove-outline",
  agent_status_changed: "pulse-outline",
  message_sent: "chatbubble-outline",
  deliverable_created: "document-outline",
  project_created: "folder-open-outline",
  project_updated: "folder-outline",
};

const TYPE_COLORS: Record<string, string> = {
  task_created: "#2563eb",
  task_updated: "#d97706",
  task_completed: "#16a34a",
  task_rejected: "#dc2626",
  task_approved: "#16a34a",
  task_assigned: "#7c3aed",
  task_unassigned: "#6b7280",
  agent_status_changed: "#0891b2",
  message_sent: "#6b7280",
  deliverable_created: "#2563eb",
  project_created: "#d97706",
  project_updated: "#6b7280",
};

function getIcon(type: string) {
  return TYPE_ICONS[type] ?? "information-circle-outline";
}

function getColor(type: string) {
  return TYPE_COLORS[type] ?? "#6b7280";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PAGE_SIZE = 30;

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ActivityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  const [result, reexecute] = useQuery<{ activitiesConnection: ActivitiesConnection }>({
    query: ACTIVITIES_CONNECTION_QUERY,
    variables: { first: PAGE_SIZE, after: undefined },
    requestPolicy: "cache-and-network",
  });

  const { data, fetching, error } = result;
  const connection = data?.activitiesConnection;
  const activities = connection?.activities ?? [];
  const hasMore = connection?.hasMore ?? false;

  function handleRefresh() {
    setCursor(undefined);
    setAllActivities([]);
    reexecute({ requestPolicy: "network-only" });
  }

  // Combine initial + paginated
  const displayed = allActivities.length > 0 ? allActivities : activities;

  if (fetching && displayed.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && displayed.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load activity</Text>
        <TouchableOpacity onPress={handleRefresh}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={displayed}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: insets.bottom + 16 },
        displayed.length === 0 && styles.emptyContainer,
      ]}
      refreshControl={
        <RefreshControl
          refreshing={fetching && displayed.length > 0}
          onRefresh={handleRefresh}
          tintColor="#2563eb"
        />
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No activity yet</Text>
        </View>
      }
      ListFooterComponent={
        hasMore ? (
          <TouchableOpacity
            style={styles.loadMoreBtn}
            onPress={() => {
              // Simple approach: just show more from existing data
              // In a full implementation this would use pagination cursor
            }}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Text style={styles.loadMoreText}>Load more</Text>
            )}
          </TouchableOpacity>
        ) : null
      }
      renderItem={({ item, index }) => {
        const color = getColor(item.type);
        const prevItem = index > 0 ? displayed[index - 1] : null;
        const showDate =
          !prevItem ||
          new Date(item.createdAt).toDateString() !==
            new Date(prevItem.createdAt).toDateString();

        return (
          <>
            {showDate && (
              <Text style={styles.dateDivider}>
                {new Date(item.createdAt).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            )}
            <View style={styles.activityRow}>
              {/* Timeline line + dot */}
              <View style={styles.timelineCol}>
                <View style={[styles.dot, { backgroundColor: color }]} />
                <View style={styles.line} />
              </View>

              {/* Content */}
              <View style={styles.contentCol}>
                {/* Header: avatar + name + time */}
                <View style={styles.activityHeader}>
                  <View style={[styles.avatar, { borderColor: color }]}>
                    <Text style={[styles.avatarText, { color }]}>
                      {item.profile.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.actorName} numberOfLines={1}>
                    {item.profile.displayName}
                  </Text>
                  <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
                </View>

                {/* Message */}
                <Text style={styles.activityMessage}>{item.message}</Text>

                {/* Task link */}
                {item.task && (
                  <TouchableOpacity
                    style={styles.taskLink}
                    onPress={() => router.push(`/task/${item.task!.id}`)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.taskLinkText}>
                      #{item.task.taskNumber} · {item.task.title}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </>
        );
      }}
    />
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  errorText: { color: "#dc2626", fontSize: 16 },
  retryText: { color: "#2563eb", fontSize: 14, fontWeight: "600" },
  listContent: { padding: 16, gap: 0 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyState: { alignItems: "center" },
  emptyText: { color: "#9ca3af", fontSize: 16 },

  dateDivider: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 28,
  },

  activityRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
  },

  // Timeline
  timelineCol: {
    width: 16,
    alignItems: "center",
    paddingTop: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  line: {
    flex: 1,
    width: 1,
    backgroundColor: "#e5e7eb",
    marginTop: 4,
    minHeight: 20,
  },

  // Content
  contentCol: {
    flex: 1,
    paddingBottom: 16,
    gap: 6,
  },
  activityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#f3f4f6",
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "700",
  },
  actorName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  timeText: {
    fontSize: 11,
    color: "#9ca3af",
  },
  activityMessage: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  taskLink: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#eff6ff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    alignSelf: "flex-start",
  },
  taskLinkText: {
    fontSize: 12,
    color: "#2563eb",
    fontWeight: "500",
  },
  loadMoreBtn: {
    marginTop: 12,
    padding: 12,
    alignItems: "center",
  },
  loadMoreText: {
    color: "#2563eb",
    fontWeight: "600",
    fontSize: 14,
  },
});
