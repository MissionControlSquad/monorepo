import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TextInput,
} from "react-native";
import { useQuery } from "urql";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TASKS_QUERY } from "@agentcenter/graphql-client";
import { PAGE_SIZE_DEFAULT, PRIORITY_FILTER_OPTIONS, DUE_DATE_FILTER_OPTIONS, matchesDueDateFilter } from "@agentcenter/utils";
import type { DueDateFilter, PriorityFilter } from "@agentcenter/utils";
import { TaskCard } from "../../src/components/TaskCard";
import { KanbanBoard } from "../../src/components/KanbanBoard";

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


export default function TaskListScreen() {
  const router = useRouter();
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
      {/* Search bar + view toggle */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search tasks…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        <TouchableOpacity
          onPress={() => setFiltersOpen((v) => !v)}
          style={[styles.viewToggle, filtersOpen && styles.viewToggleActive]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="options-outline" size={20} color={filtersOpen ? "#2563eb" : "#6b7280"} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setViewMode((m) => (m === "list" ? "kanban" : "list"))}
          style={styles.viewToggle}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={viewMode === "list" ? "grid-outline" : "list-outline"}
            size={20}
            color="#6b7280"
          />
        </TouchableOpacity>
      </View>

      {/* Advanced filter panel */}
      {filtersOpen && (
        <View style={styles.filterPanel}>
          {/* Due date */}
          <Text style={styles.filterSectionLabel}>Due Date</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {DUE_DATE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.filterChip, dueDateFilter === opt.key && styles.filterChipActive]}
                onPress={() => setDueDateFilter(dueDateFilter === opt.key ? "" : opt.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterChipText, dueDateFilter === opt.key && styles.filterChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Priority filter */}
          <Text style={styles.filterSectionLabel}>Priority</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.filterChip, priorityFilter === opt.key && styles.filterChipActive]}
                onPress={() => setPriorityFilter(priorityFilter === opt.key ? "" : opt.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterChipText, priorityFilter === opt.key && styles.filterChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Toggle filters */}
          <Text style={styles.filterSectionLabel}>More Filters</Text>
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.filterChip, blockedOnly && styles.filterChipActive]}
              onPress={() => setBlockedOnly((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, blockedOnly && styles.filterChipTextActive]}>
                Blocked only
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, topLevelOnly && styles.filterChipActive]}
              onPress={() => setTopLevelOnly((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, topLevelOnly && styles.filterChipTextActive]}>
                Top-level only
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, unassignedOnly && styles.filterChipActive]}
              onPress={() => setUnassignedOnly((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, unassignedOnly && styles.filterChipTextActive]}>
                Unassigned only
              </Text>
            </TouchableOpacity>
          </View>

          {activeFilterCount > 0 && (
            <TouchableOpacity
              onPress={() => {
                setDueDateFilter("");
                setPriorityFilter("");
                setBlockedOnly(false);
                setTopLevelOnly(false);
                setUnassignedOnly(false);
              }}
              style={styles.clearFiltersBtn}
            >
              <Text style={styles.clearFiltersBtnText}>Clear all filters</Text>
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
            contentContainerStyle={[
              styles.listContent,
              tasks.length === 0 && styles.emptyContainer,
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
              <Text style={styles.emptyText}>
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
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        onPress={() => router.push("/task/create")}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f9fafb", gap: 12 },
  errorText: { color: "#dc2626", fontSize: 16 },
  retryText: { color: "#2563eb", fontSize: 14, fontWeight: "600" },

  filterBar: { height: 52, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  filterContent: { paddingHorizontal: 12, gap: 8, flexDirection: "row", alignItems: "center", height: 52 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#f3f4f6" },
  chipActive: { backgroundColor: "#dbeafe" },
  chipText: { fontSize: 13, color: "#6b7280", fontWeight: "500" },
  chipTextActive: { color: "#2563eb", fontWeight: "600" },

  listContent: { padding: 16, gap: 10, paddingBottom: 90 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { color: "#9ca3af", fontSize: 16 },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchIcon: { fontSize: 14 },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  viewToggle: { padding: 4, position: "relative" },
  viewToggleActive: { backgroundColor: "#eff6ff", borderRadius: 8 },

  filterBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
  },
  filterBadgeText: { fontSize: 9, color: "#fff", fontWeight: "700" },

  filterPanel: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  filterSectionLabel: { fontSize: 11, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  filterChipActive: { backgroundColor: "#dbeafe", borderColor: "#93c5fd" },
  filterChipText: { fontSize: 12, color: "#6b7280", fontWeight: "500" },
  filterChipTextActive: { color: "#2563eb", fontWeight: "600" },
  clearFiltersBtn: { alignSelf: "flex-start", marginTop: 2 },
  clearFiltersBtnText: { fontSize: 12, color: "#dc2626", fontWeight: "600" },

  fab: {
    position: "absolute",
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  fabIcon: { fontSize: 28, color: "#fff", lineHeight: 32 },
});
