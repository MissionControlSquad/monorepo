import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useQuery, useMutation } from "urql";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  UNDELIVERED_NOTIFICATIONS_QUERY,
  MARK_MANY_NOTIFICATIONS_DELIVERED,
  MARK_NOTIFICATION_DELIVERED,
} from "@agentcenter/graphql-client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentRef {
  id: string;
  name: string;
  identityEmoji: string | null;
}

interface TaskRef {
  id: string;
  title: string;
  taskNumber: number;
  status: string;
}

interface Notification {
  id: string;
  mentionedAgentId: string;
  content: string;
  taskId: string | null;
  messageId: string | null;
  delivered: boolean;
  deliveredAt: string | null;
  createdAt: string;
  mentionedAgent: AgentRef;
  task: TaskRef | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const STATUS_COLORS: Record<string, string> = {
  inbox: "#6b7280",
  assigned: "#2563eb",
  in_progress: "#d97706",
  review: "#7c3aed",
  done: "#16a34a",
  blocked: "#dc2626",
};

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [result, reexecute] = useQuery<{
    undeliveredNotifications: Notification[];
  }>({
    query: UNDELIVERED_NOTIFICATIONS_QUERY,
    requestPolicy: "cache-and-network",
  });

  const [, markManyDelivered] = useMutation(MARK_MANY_NOTIFICATIONS_DELIVERED);
  const [, markOneDelivered] = useMutation(MARK_NOTIFICATION_DELIVERED);

  const { data, fetching, error } = result;
  const notifications = data?.undeliveredNotifications ?? [];

  async function handleMarkAllRead() {
    if (notifications.length === 0) return;
    const ids = notifications.map((n) => n.id);
    const res = await markManyDelivered({ ids });
    if (res.error) {
      Alert.alert("Error", "Failed to mark notifications as read");
    } else {
      reexecute({ requestPolicy: "network-only" });
    }
  }

  if (fetching && notifications.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && notifications.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load notifications</Text>
        <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={notifications}
      keyExtractor={(n) => n.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: insets.bottom + 16 },
        notifications.length === 0 && styles.emptyContainer,
      ]}
      refreshControl={
        <RefreshControl
          refreshing={fetching && notifications.length > 0}
          onRefresh={() => reexecute({ requestPolicy: "network-only" })}
          tintColor="#2563eb"
        />
      }
      ListHeaderComponent={
        notifications.length > 0 ? (
          <View style={styles.header}>
            <Text style={styles.headerCount}>
              {notifications.length} unread
            </Text>
            <TouchableOpacity onPress={handleMarkAllRead}>
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptySubtitle}>No unread notifications</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={async () => {
            // Mark as read then navigate to task if available
            await markOneDelivered({ id: item.id });
            reexecute({ requestPolicy: "network-only" });
            if (item.task) {
              router.push(`/task/${item.task.id}`);
            }
          }}
        >
          {/* Unread dot */}
          <View style={styles.unreadDot} />

          {/* Agent badge + time + mark-read */}
          <View style={styles.agentRow}>
            <View style={styles.agentBadge}>
              <Text style={styles.agentEmoji}>
                {item.mentionedAgent.identityEmoji ?? "🤖"}
              </Text>
              <Text style={styles.agentName}>{item.mentionedAgent.name}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
              <TouchableOpacity
                onPress={async (e) => {
                  e.stopPropagation?.();
                  await markOneDelivered({ id: item.id });
                  reexecute({ requestPolicy: "network-only" });
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.markReadBtn}
              >
                <Text style={styles.markReadBtnText}>✓</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Content */}
          <Text style={styles.content}>{item.content}</Text>

          {/* Task link */}
          {item.task && (
            <View style={styles.taskLink}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: STATUS_COLORS[item.task.status] ?? "#6b7280" },
                ]}
              />
              <Text style={styles.taskLinkText} numberOfLines={1}>
                #{item.task.taskNumber} · {item.task.title}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    />
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  errorText: { color: "#dc2626", fontSize: 16 },
  retryText: { color: "#2563eb", fontSize: 14, fontWeight: "600" },

  listContent: { padding: 16, gap: 10 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  headerCount: { fontSize: 13, color: "#6b7280", fontWeight: "500" },
  markAllText: { fontSize: 13, color: "#2563eb", fontWeight: "600" },

  emptyState: { alignItems: "center", gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: "600", color: "#374151" },
  emptySubtitle: { fontSize: 14, color: "#9ca3af" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
    position: "relative",
  },
  unreadDot: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563eb",
  },
  agentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  agentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  agentEmoji: { fontSize: 14 },
  agentName: { fontSize: 12, fontWeight: "600", color: "#374151" },
  timeText: { fontSize: 11, color: "#9ca3af" },
  markReadBtn: { backgroundColor: "#f3f4f6", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  markReadBtnText: { fontSize: 11, color: "#6b7280", fontWeight: "600" },

  content: { fontSize: 14, color: "#374151", lineHeight: 20 },

  taskLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  taskLinkText: { fontSize: 12, color: "#2563eb", fontWeight: "500", flex: 1 },
});
