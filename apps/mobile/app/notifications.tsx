import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNotifications } from "../src/context/NotificationCountContext";
import { NOTIFICATION_TYPE_HEX_COLORS, DEFAULT_COLOR, formatRelativeTime } from "@agentcenter/utils";

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


// ── Main Screen ───────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { notifications, fetching, error, reexecute, markOneRead, markAllRead } = useNotifications();

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  if (fetching && notifications.length === 0) {
    return (
      <View className="flex-1 justify-center items-center gap-3">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && notifications.length === 0) {
    return (
      <View className="flex-1 justify-center items-center gap-3">
        <Text className="text-red-600 dark:text-red-400 text-base">Failed to load notifications</Text>
        <TouchableOpacity onPress={reexecute}>
          <Text className="text-blue-600 dark:text-blue-400 text-sm font-semibold">Retry</Text>
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
        { padding: 16, gap: 10, paddingBottom: insets.bottom + 16 },
        notifications.length === 0 && { flex: 1, justifyContent: "center", alignItems: "center" },
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
          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-[13px] text-gray-500 dark:text-slate-400 font-medium">
              {unreadCount > 0 ? `${unreadCount} unread` : "All read"}
            </Text>
            {unreadCount > 0 && (
              <TouchableOpacity onPress={markAllRead}>
                <Text className="text-[13px] text-blue-600 dark:text-blue-400 font-semibold">Mark all read</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View className="items-center gap-2.5">
          <Ionicons name="notifications-outline" size={48} color="#d1d5db" />
          <Text className="text-[17px] font-semibold text-gray-700 dark:text-slate-300">All caught up</Text>
          <Text className="text-sm text-gray-400 dark:text-slate-500">No notifications yet</Text>
        </View>
      }
      renderItem={({ item }) => {
        const isUnread = !item.readAt;
        const iconName: IoniconName = TYPE_ICONS[item.type] ?? "alert-circle";
        const iconColor = NOTIFICATION_TYPE_HEX_COLORS[item.type] ?? DEFAULT_COLOR;

        return (
          <TouchableOpacity
            className={`rounded-xl p-3.5 border ${isUnread ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800" : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700"}`}
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
            <View className="flex-row items-start gap-3">
              {/* Type icon */}
              <View
                className="w-9 h-9 rounded-full justify-center items-center shrink-0"
                style={{ backgroundColor: iconColor + "18" }}
              >
                <Ionicons name={iconName} size={18} color={iconColor} />
              </View>

              {/* Content */}
              <View className="flex-1 gap-0.5">
                <Text
                  className={`text-sm leading-[19px] ${isUnread ? "text-gray-900 dark:text-slate-100 font-semibold" : "text-gray-500 dark:text-slate-400"}`}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
                {item.body ? (
                  <Text className="text-[12px] text-gray-400 dark:text-slate-500 leading-[17px]" numberOfLines={2}>
                    {item.body}
                  </Text>
                ) : null}
                <Text className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
                  {formatRelativeTime(item.createdAt)}
                </Text>
              </View>

              {/* Unread dot */}
              {isUnread && <View className="w-2 h-2 rounded-full bg-blue-600 mt-1 shrink-0" />}
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}
