import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useQuery, useSubscription } from "urql";
import { useRouter } from "expo-router";
import { useState, useCallback, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SearchBar } from "../src/components/SearchBar";
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
  const [search, setSearch] = useState("");
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
  const allDisplayed: Activity[] = (() => {
    const base = pageFetched.length === 0 ? accumulated : appendDeduped(accumulated, pageFetched);
    return prependDeduped(base, liveItems);
  })();
  const q = search.trim().toLowerCase();
  const displayed = q
    ? allDisplayed.filter(
        (a) =>
          a.type.toLowerCase().includes(q) ||
          (a.summary ?? "").toLowerCase().includes(q),
      )
    : allDisplayed;

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
      <View className="flex-1 justify-center items-center gap-3">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && displayed.length === 0) {
    return (
      <View className="flex-1 justify-center items-center gap-3">
        <Text className="text-red-600 dark:text-red-400 text-base">Failed to load activity</Text>
        <TouchableOpacity onPress={handleRefresh}>
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
        placeholder="Search activity…"
      />
    <FlatList
      data={displayed}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        { padding: 16, gap: 0, paddingBottom: insets.bottom + 16 },
        displayed.length === 0 && { flex: 1, justifyContent: "center", alignItems: "center" },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={fetching && displayed.length === 0}
          onRefresh={handleRefresh}
          tintColor="#2563eb"
        />
      }
      ListEmptyComponent={
        <Text className="text-gray-400 dark:text-slate-500 text-base">No activity yet</Text>
      }
      ListFooterComponent={
        hasMore ? (
          <TouchableOpacity
            className="mt-3 p-3 items-center"
            onPress={handleLoadMore}
            disabled={fetching}
          >
            {fetching ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Text className="text-blue-600 dark:text-blue-400 font-semibold text-sm">Load more</Text>
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
              <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide mt-5 mb-2 ml-7">
                {new Date(item.createdAt).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            )}
            <View className="flex-row gap-3 mb-1">
              {/* Timeline line + dot */}
              <View className="w-4 items-center pt-1">
                <View className="w-2.5 h-2.5 rounded-full mt-1" style={{ backgroundColor: color }} />
                <View className="flex-1 w-px bg-gray-200 dark:bg-slate-700 mt-1" style={{ minHeight: 20 }} />
              </View>

              {/* Content */}
              <View className="flex-1 pb-4 gap-1.5">
                {/* Header: avatar + name + time */}
                <View className="flex-row items-center gap-2">
                  <View
                    className="w-7 h-7 rounded-full bg-gray-100 dark:bg-slate-700 border-[1.5px] justify-center items-center"
                    style={{ borderColor: color }}
                  >
                    <Text className="text-xs font-bold" style={{ color }}>
                      {item.profile?.displayName?.charAt(0)?.toUpperCase() ?? "?"}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100 flex-1" numberOfLines={1}>
                    {item.profile?.displayName ?? "Unknown"}
                  </Text>
                  <Text className="text-xs text-gray-400 dark:text-slate-500">{formatRelativeTime(item.createdAt)}</Text>
                </View>

                {/* Message */}
                <Text className="text-sm text-gray-700 dark:text-slate-300 leading-5">{item.message}</Text>

                {/* Task link */}
                {item.task && (
                  <TouchableOpacity
                    className="px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800 self-start"
                    onPress={() => router.push(`/task/${item.task!.id}`)}
                    activeOpacity={0.7}
                  >
                    <Text className="text-xs text-blue-600 dark:text-blue-400 font-medium">
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
    </View>
  );
}
