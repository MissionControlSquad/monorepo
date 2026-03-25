import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KanbanBoard } from "../../src/components/KanbanBoard";
import { PRIORITY_FILTER_OPTIONS, DUE_DATE_FILTER_OPTIONS } from "@agentcenter/utils";
import type { DueDateFilter, PriorityFilter } from "@agentcenter/utils";
import { useTheme } from "../../src/hooks/useTheme";
import { FilterChip } from "../../src/components/FilterChip";
import { FAB } from "../../src/components/FAB";

const DUE_DATE_OPTIONS = DUE_DATE_FILTER_OPTIONS as { key: DueDateFilter; label: string }[];
const PRIORITY_OPTIONS = PRIORITY_FILTER_OPTIONS as { key: PriorityFilter; label: string }[];


export default function KanbanScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useTheme();

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
          <Ionicons name="options-outline" size={22} color={filtersOpen ? colors.accent : colors.icon} />
          {activeFilterCount > 0 && (
            <View className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-600 justify-center items-center">
              <Text className="text-xs text-white font-bold">{activeFilterCount}</Text>
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

      <FAB onPress={() => router.push(`/task/create?projectId=${projectId}` as Parameters<typeof router.push>[0])} />
    </View>
  );
}
