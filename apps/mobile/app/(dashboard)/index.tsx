import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useQuery } from "urql";
import { useRouter, useNavigation } from "expo-router";
import { useState, useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TASKS_QUERY } from "@agentcenter/graphql-client";
import { PAGE_SIZE_DEFAULT, PRIORITY_FILTER_OPTIONS, DUE_DATE_FILTER_OPTIONS, matchesDueDateFilter } from "@agentcenter/utils";
import type { DueDateFilter, PriorityFilter } from "@agentcenter/utils";
import { TaskCard } from "../../src/components/TaskCard";
import { KanbanBoard } from "../../src/components/KanbanBoard";
import { useTheme } from "../../src/hooks/useTheme";
import { NotificationBell } from "../../src/components/NotificationBell";
import { SearchBar } from "../../src/components/SearchBar";

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
  parentTaskId: string | null;
  blockedByTaskId: string | null;
  assignees: TaskAssignee[];
  project: { id: string; name: string } | null;
}

type StatusFilter = "all" | "inbox" | "assigned" | "in_progress" | "review" | "done" | "blocked";
type ViewMode = "list" | "kanban";

const PRIORITY_OPTIONS = PRIORITY_FILTER_OPTIONS as { key: PriorityFilter; label: string }[];
const DUE_DATE_OPTIONS = DUE_DATE_FILTER_OPTIONS as { key: DueDateFilter; label: string }[];

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "inbox", label: "Inbox" },
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In Progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
  { key: "blocked", label: "Blocked" },
];

const FilterChip = ({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity
    className={`px-3 py-1.5 rounded-full border ${active ? "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700" : "bg-gray-100 dark:bg-slate-700 border-gray-200 dark:border-slate-600"}`}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Text className={`text-xs ${active ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-gray-500 dark:text-slate-400 font-medium"}`}>
      {label}
    </Text>
  </TouchableOpacity>
);

export default function TaskListScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE_DEFAULT);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Advanced filters
  const [dueDateFilter, setDueDateFilter] = useState<DueDateFilter>("");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("");
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [topLevelOnly, setTopLevelOnly] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  const activeFilterCount = [
    dueDateFilter !== "",
    priorityFilter !== "",
    blockedOnly,
    topLevelOnly,
    unassignedOnly,
  ].filter(Boolean).length;

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginRight: 8 }}>
          <TouchableOpacity onPress={() => router.push("/search")} style={{ padding: 8 }}>
            <Ionicons name="search-outline" size={22} color={colors.icon} />
          </TouchableOpacity>
          <NotificationBell
            onPress={() => router.push("/notifications")}
            color={colors.icon}
          />
        </View>
      ),
    });
  }, [navigation, colors.icon]);

  const [result, reexecute] = useQuery<{ tasks: Task[] }>({
    query: TASKS_QUERY,
    variables: { limit },
    requestPolicy: "cache-and-network",
  });

  const { data, fetching, error } = result;
  const allTasks = data?.tasks ?? [];
  const hasMore = allTasks.length === limit;

  // Apply filters
  let tasks = filter === "all" ? allTasks : allTasks.filter((t) => t.status === filter);
  if (priorityFilter) tasks = tasks.filter((t) => t.priority === priorityFilter);
  if (blockedOnly) tasks = tasks.filter((t) => t.blockedByTaskId != null);
  if (topLevelOnly) tasks = tasks.filter((t) => t.parentTaskId == null);
  if (unassignedOnly) tasks = tasks.filter((t) => t.assignees.length === 0);
  tasks = tasks.filter((t) => matchesDueDateFilter(t.dueDate, dueDateFilter));
  if (search.trim()) {
    tasks = tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        String(t.taskNumber).includes(search)
    );
  }

  if (fetching && allTasks.length === 0) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900 gap-3">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && allTasks.length === 0) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900 gap-3">
        <Text className="text-red-600 dark:text-red-400 text-base">Failed to load tasks</Text>
        <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })}>
          <Text className="text-blue-600 dark:text-blue-400 text-sm font-semibold">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-slate-900">
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search tasks…"
        right={
          <>
            <TouchableOpacity
              onPress={() => setFiltersOpen((v) => !v)}
              className={`p-1 relative ${filtersOpen ? "bg-blue-50 dark:bg-blue-900/20 rounded-lg" : ""}`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="options-outline" size={20} color={filtersOpen ? "#2563eb" : "#6b7280"} />
              {activeFilterCount > 0 && (
                <View className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-blue-600 justify-center items-center">
                  <Text className="text-xs text-white font-bold">{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode((m) => (m === "list" ? "kanban" : "list"))}
              className="p-1"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={viewMode === "list" ? "grid-outline" : "list-outline"}
                size={20}
                color="#6b7280"
              />
            </TouchableOpacity>
          </>
        }
      />

      {/* Advanced filter panel */}
      {filtersOpen && (
        <View className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-3.5 pt-2.5 pb-3 gap-2">
          <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Due Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 8 }}>
            {DUE_DATE_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.key}
                label={opt.label}
                active={dueDateFilter === opt.key}
                onPress={() => setDueDateFilter(dueDateFilter === opt.key ? "" : opt.key)}
              />
            ))}
          </ScrollView>

          <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Priority</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 8 }}>
            {PRIORITY_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.key}
                label={opt.label}
                active={priorityFilter === opt.key}
                onPress={() => setPriorityFilter(priorityFilter === opt.key ? "" : opt.key)}
              />
            ))}
          </ScrollView>

          <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">More Filters</Text>
          <View className="flex-row flex-wrap gap-2">
            <FilterChip label="Blocked only" active={blockedOnly} onPress={() => setBlockedOnly((v) => !v)} />
            <FilterChip label="Top-level only" active={topLevelOnly} onPress={() => setTopLevelOnly((v) => !v)} />
            <FilterChip label="Unassigned only" active={unassignedOnly} onPress={() => setUnassignedOnly((v) => !v)} />
          </View>

          {activeFilterCount > 0 && (
            <TouchableOpacity
              className="self-start mt-0.5"
              onPress={() => {
                setDueDateFilter("");
                setPriorityFilter("");
                setBlockedOnly(false);
                setTopLevelOnly(false);
                setUnassignedOnly(false);
              }}
            >
              <Text className="text-xs text-red-600 dark:text-red-400 font-semibold">Clear all filters</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {viewMode === "kanban" ? (
        /* ── Kanban view ── */
        <KanbanBoard
          bottomPadding={60}
          blockedOnly={blockedOnly || undefined}
          topLevelOnly={topLevelOnly || undefined}
          unassignedOnly={unassignedOnly || undefined}
          dueDateFilter={dueDateFilter || undefined}
          priorities={priorityFilter ? [priorityFilter] : undefined}
        />
      ) : (
        /* ── List view ── */
        <>
          {/* Status filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            bounces={false}
            directionalLockEnabled={true}
            className="h-14 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700"
            contentContainerStyle={{ paddingHorizontal: 12, gap: 8, flexDirection: "row", alignItems: "center", height: 52 }}
          >
            {FILTERS.map((f) => {
              const count = f.key === "all" ? allTasks.length : allTasks.filter((t) => t.status === f.key).length;
              return (
                <TouchableOpacity
                  key={f.key}
                  className={`px-3.5 py-2 rounded-full ${filter === f.key ? "bg-blue-100 dark:bg-blue-900/30" : "bg-gray-100 dark:bg-slate-700"}`}
                  onPress={() => setFilter(f.key)}
                >
                  <Text className={`text-sm ${filter === f.key ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-gray-500 dark:text-slate-400 font-medium"}`}>
                    {f.label} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <FlatList
            data={tasks}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              { padding: 16, gap: 10, paddingBottom: 90 },
              tasks.length === 0 && { flex: 1, justifyContent: "center", alignItems: "center" },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={fetching && allTasks.length > 0}
                onRefresh={() => {
                  setLimit(PAGE_SIZE_DEFAULT);
                  reexecute({ requestPolicy: "network-only" });
                }}
                tintColor="#2563eb"
              />
            }
            onEndReached={() => {
              if (hasMore && !fetching) setLimit((l) => l + PAGE_SIZE_DEFAULT);
            }}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              fetching && allTasks.length > 0 ? (
                <ActivityIndicator color="#2563eb" style={{ marginVertical: 16 }} />
              ) : null
            }
            ListEmptyComponent={
              <Text className="text-gray-400 dark:text-slate-500 text-base">
                {activeFilterCount > 0 || filter !== "all"
                  ? "No tasks match the current filters"
                  : "No tasks yet"}
              </Text>
            }
            renderItem={({ item }) => (
              <TaskCard
                task={item}
                onPress={() => router.push(`/task/${item.id}`)}
              />
            )}
          />
        </>
      )}

      {/* FAB — Create task */}
      <TouchableOpacity
        className="absolute right-5 w-14 h-14 rounded-full bg-blue-600 justify-center items-center"
        style={{
          bottom: insets.bottom + 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.2,
          shadowRadius: 6,
          elevation: 6,
        }}
        onPress={() => router.push("/task/create")}
        activeOpacity={0.85}
      >
        <Text className="text-3xl text-white leading-8">+</Text>
      </TouchableOpacity>
    </View>
  );
}
