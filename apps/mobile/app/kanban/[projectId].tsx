import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { KanbanBoard } from "../../src/components/KanbanBoard";
import { PRIORITY_FILTER_OPTIONS, DUE_DATE_FILTER_OPTIONS } from "@agentcenter/utils";
import type { DueDateFilter, PriorityFilter } from "@agentcenter/utils";

const DUE_DATE_OPTIONS = DUE_DATE_FILTER_OPTIONS as { key: DueDateFilter; label: string }[];
const PRIORITY_OPTIONS = PRIORITY_FILTER_OPTIONS as { key: PriorityFilter; label: string }[];

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
          className="mr-4 p-1 relative"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="options-outline" size={22} color={filtersOpen ? "#2563eb" : "#374151"} />
          {activeFilterCount > 0 && (
            <View className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-600 justify-center items-center">
              <Text className="text-[9px] text-white font-bold">{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, filtersOpen, activeFilterCount]);

  return (
    <View className="flex-1">
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
        className="absolute right-5 w-[52px] h-[52px] rounded-full bg-blue-600 justify-center items-center"
        style={{
          bottom: insets.bottom + 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 8,
        }}
        onPress={() => router.push(`/task/create?projectId=${projectId}` as Parameters<typeof router.push>[0])}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}
