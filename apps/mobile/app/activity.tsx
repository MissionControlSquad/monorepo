import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useQuery, useSubscription } from "urql";
import { useRouter } from "expo-router";
import { useState, useCallback, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ACTIVITIES_CONNECTION_QUERY, ACTIVITY_CREATED_SUBSCRIPTION } from "@agentcenter/graphql-client";
import { ACTIVITY_TYPE_HEX_COLORS, DEFAULT_COLOR, PAGE_SIZE_DEFAULT, formatRelativeTime, appendDeduped, prependDeduped } from "@agentcenter/utils";
import type { Activity } from "@agentcenter/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivitiesConnection {
  activities: Activity[];
  hasMore: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getColor(type: string) {
  return ACTIVITY_TYPE_HEX_COLORS[type] ?? DEFAULT_COLOR;
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ActivityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [after, setAfter] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<Activity[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [liveItems, setLiveItems] = useState<Activity[]>([]);
  const seenIds = useRef(new Set<string>());

  const [result, reexecute] = useQuery<{ activitiesConnection: ActivitiesConnection }>({
    query: ACTIVITIES_CONNECTION_QUERY,
    variables: { first: PAGE_SIZE_DEFAULT, after },
    requestPolicy: "cache-and-network",
  });

  useSubscription(
    { query: ACTIVITY_CREATED_SUBSCRIPTION },
    (_prev, data: { activityCreated: Activity }) => {
      const item = data?.activityCreated;
      if (item && !seenIds.current.has(item.id)) {
        seenIds.current.add(item.id);
        setLiveItems((prev) => [item, ...prev]);
      }
      return data;
    },
  );

  const { data, fetching, error } = result;
  const connection = data?.activitiesConnection;
  const pageFetched = connection?.activities ?? [];
  const hasMore = connection?.hasMore ?? false;

  // Merge live (real-time) items on top, then paginated items below
  const displayed: Activity[] = (() => {
    const base = pageFetched.length === 0 ? accumulated : appendDeduped(accumulated, pageFetched);
    return prependDeduped(base, liveItems);
  })();

  function handleRefresh() {
    setAfter(undefined);
    setAccumulated([]);
    setLiveItems([]);
    seenIds.current.clear();
    reexecute({ requestPolicy: "network-only" });
  }

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || fetching) return;
    const last = pageFetched[pageFetched.length - 1];
    if (!last) return;
    // Commit current page into accumulated before advancing cursor
    setAccumulated((prev) => appendDeduped(prev, pageFetched));
    setAfter(last.id);
  }, [hasMore, loadingMore, fetching, pageFetched]);

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
          refreshing={fetching && displayed.length === 0}
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
            onPress={handleLoadMore}
            disabled={fetching}
          >
            {fetching ? (
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
                      {item.profile?.displayName?.charAt(0)?.toUpperCase() ?? "?"}
                    </Text>
                  </View>
                  <Text style={styles.actorName} numberOfLines={1}>
                    {item.profile?.displayName ?? "Unknown"}
                  </Text>
                  <Text style={styles.timeText}>{formatRelativeTime(item.createdAt)}</Text>
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
