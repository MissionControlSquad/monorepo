import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNotifications } from "../src/context/NotificationCountContext";
import { NOTIFICATION_TYPE_HEX_COLORS, DEFAULT_COLOR, formatRelativeTime } from "@agentcenter/utils";
import { SearchBar } from "../src/components/SearchBar";

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
  const [search, setSearch] = useState("");
  const { notifications, fetching, error, hasMore, reexecute, loadMore, markOneRead, markAllRead } = useNotifications();

  const q = search.trim().toLowerCase();
  const displayed = q
    ? notifications.filter(
        (n) =>
          n.title?.toLowerCase().includes(q) ||
          n.body?.toLowerCase().includes(q),
      )
    : notifications;

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
    <View className="flex-1">
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search notifications…"
      />
    <FlatList
      data={displayed}
      keyExtractor={(n) => n.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        { padding: 16, gap: 10, paddingBottom: insets.bottom + 16 },
        displayed.length === 0 && { flex: 1, justifyContent: "center", alignItems: "center" },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={fetching && notifications.length > 0}
          onRefresh={reexecute}
          tintColor="#2563eb"
        />
      }
      ListHeaderComponent={
        displayed.length > 0 ? (
          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-sm text-gray-500 dark:text-slate-400 font-medium">
              {q ? `${displayed.length} result${displayed.length !== 1 ? "s" : ""}` : unreadCount > 0 ? `${unreadCount} unread` : "All read"}
            </Text>
            {!q && unreadCount > 0 && (
              <TouchableOpacity onPress={markAllRead}>
                <Text className="text-sm text-blue-600 dark:text-blue-400 font-semibold">Mark all read</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null
      }
      ListFooterComponent={
        !q && hasMore ? (
          <TouchableOpacity
            className="mt-2 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 items-center"
            onPress={loadMore}
            disabled={fetching}
            activeOpacity={0.7}
          >
            {fetching ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Text className="text-sm text-blue-600 dark:text-blue-400 font-semibold">Load more</Text>
            )}
          </TouchableOpacity>
        ) : null
      }
      ListEmptyComponent={
        <View className="items-center gap-2.5">
          <Ionicons name="notifications-outline" size={48} color="#d1d5db" />
          <Text className="text-lg font-semibold text-gray-700 dark:text-slate-300">
            {q ? "No matches" : "All caught up"}
          </Text>
          <Text className="text-sm text-gray-400 dark:text-slate-500">
            {q ? "Try a different search term" : "No notifications yet"}
          </Text>
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
                  className={`text-sm leading-5 ${isUnread ? "text-gray-900 dark:text-slate-100 font-semibold" : "text-gray-500 dark:text-slate-400"}`}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
                {item.body ? (
                  <Text className="text-xs text-gray-400 dark:text-slate-500 leading-4" numberOfLines={2}>
                    {item.body}
                  </Text>
                ) : null}
                <Text className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
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
    </View>
  );
}
