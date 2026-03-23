import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNotifications } from "../src/context/NotificationCountContext";
import { NOTIFICATION_TYPE_HEX_COLORS, DEFAULT_COLOR } from "@agentcenter/utils";

// ── Types & constants ─────────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const TYPE_ICONS: Record<string, IoniconName> = {
  task_done: "checkmark-circle",
  task_needs_review: "time",
  task_clarification_requested: "help-circle",
  task_approved: "checkmark-circle",
  task_rejected: "close-circle",
  new_comment: "chatbubble",
  mention: "at",
  deliverable_submitted: "document-text",
  task_assigned: "person-add",
};


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

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { notifications, fetching, error, reexecute, markOneRead, markAllRead } = useNotifications();

  const unreadCount = notifications.filter((n) => !n.readAt).length;

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
        <TouchableOpacity onPress={reexecute}>
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
          onRefresh={reexecute}
          tintColor="#2563eb"
        />
      }
      ListHeaderComponent={
        notifications.length > 0 ? (
          <View style={styles.header}>
            {unreadCount > 0 ? (
              <Text style={styles.headerCount}>{unreadCount} unread</Text>
            ) : (
              <Text style={styles.headerCount}>All read</Text>
            )}
            {unreadCount > 0 && (
              <TouchableOpacity onPress={markAllRead}>
                <Text style={styles.markAllText}>Mark all read</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="notifications-outline" size={48} color="#d1d5db" />
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptySubtitle}>No notifications yet</Text>
        </View>
      }
      renderItem={({ item }) => {
        const isUnread = !item.readAt;
        const iconName: IoniconName = TYPE_ICONS[item.type] ?? "alert-circle";
        const iconColor = NOTIFICATION_TYPE_HEX_COLORS[item.type] ?? DEFAULT_COLOR;

        return (
          <TouchableOpacity
            style={[styles.card, isUnread && styles.cardUnread]}
            activeOpacity={0.75}
            onPress={() => {
              if (isUnread) markOneRead(item.id);
              if (item.url) {
                // Parse url to get path for router (strip origin)
                try {
                  const path = new URL(item.url).pathname;
                  router.push(path as Parameters<typeof router.push>[0]);
                } catch {
                  // url may already be a path
                  router.push(item.url as Parameters<typeof router.push>[0]);
                }
              }
            }}
          >
            <View style={styles.cardRow}>
              {/* Type icon */}
              <View style={[styles.iconWrap, { backgroundColor: iconColor + "18" }]}>
                <Ionicons name={iconName} size={18} color={iconColor} />
              </View>

              {/* Content */}
              <View style={styles.textWrap}>
                <Text
                  style={[styles.title, isUnread && styles.titleUnread]}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
                {item.body ? (
                  <Text style={styles.body} numberOfLines={2}>
                    {item.body}
                  </Text>
                ) : null}
                <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
              </View>

              {/* Unread dot */}
              {isUnread && <View style={styles.unreadDot} />}
            </View>
          </TouchableOpacity>
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

  emptyState: { alignItems: "center", gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "600", color: "#374151" },
  emptySubtitle: { fontSize: 14, color: "#9ca3af" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardUnread: { backgroundColor: "#eff6ff", borderColor: "#bfdbfe" },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  textWrap: { flex: 1, gap: 3 },
  title: { fontSize: 14, color: "#6b7280", lineHeight: 19 },
  titleUnread: { color: "#111827", fontWeight: "600" },
  body: { fontSize: 12, color: "#9ca3af", lineHeight: 17 },
  time: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563eb",
    marginTop: 4,
    flexShrink: 0,
  },
});
