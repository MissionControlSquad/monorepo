import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { KanbanBoard } from "../../src/components/KanbanBoard";

type DueDateFilter = "" | "overdue" | "today" | "this_week" | "no_due_date";
type PriorityFilter = "" | "low" | "medium" | "high" | "urgent";

const DUE_DATE_OPTIONS: { key: DueDateFilter; label: string }[] = [
  { key: "", label: "Any date" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due today" },
  { key: "this_week", label: "This week" },
  { key: "no_due_date", label: "No due date" },
];

const PRIORITY_OPTIONS: { key: PriorityFilter; label: string }[] = [
  { key: "", label: "Any" },
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
  { key: "urgent", label: "Urgent" },
];

export default function KanbanScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [filtersOpen, setFiltersOpen] = useState(false);
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
      title: "Kanban",
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setFiltersOpen((v) => !v)}
          style={{ marginRight: 16, padding: 4, position: "relative" }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="options-outline" size={22} color={filtersOpen ? "#2563eb" : "#374151"} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, filtersOpen, activeFilterCount]);

  return (
    <View style={{ flex: 1 }}>
      {filtersOpen && (
        <View style={styles.filterPanel}>
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

      <KanbanBoard
        projectId={projectId}
        blockedOnly={blockedOnly || undefined}
        topLevelOnly={topLevelOnly || undefined}
        unassignedOnly={unassignedOnly || undefined}
        dueDateFilter={dueDateFilter || undefined}
        priorities={priorityFilter ? [priorityFilter] : undefined}
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        onPress={() => router.push(`/task/create?projectId=${projectId}` as Parameters<typeof router.push>[0])}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  filterPanel: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  filterSectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterChipActive: { backgroundColor: "#dbeafe", borderColor: "#93c5fd" },
  filterChipText: { fontSize: 12, color: "#6b7280", fontWeight: "500" },
  filterChipTextActive: { color: "#2563eb", fontWeight: "600" },
  clearFiltersBtn: { alignSelf: "flex-start", marginTop: 2 },
  clearFiltersBtnText: { fontSize: 12, color: "#dc2626", fontWeight: "600" },
  filterBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
  },
  filterBadgeText: { fontSize: 9, color: "#fff", fontWeight: "700" },
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
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
});
