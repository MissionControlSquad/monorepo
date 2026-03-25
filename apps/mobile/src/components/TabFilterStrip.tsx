import { ScrollView } from "react-native";
import { FilterChip } from "./FilterChip";

export function TabFilterStrip<K extends string>({
  filters,
  activeKey,
  onSelect,
  getCount,
}: {
  filters: { key: K; label: string }[];
  activeKey: K;
  onSelect: (key: K) => void;
  getCount?: (key: K) => number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      bounces={false}
      directionalLockEnabled
      style={{ height: 48 }}
      className="flex flex-row bg-white  dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 max-h-12 min-h-12"
      contentContainerStyle={{
        paddingHorizontal: 12,
        gap: 8,
        alignItems: "center",
      }}
    >
      {filters.map((f) => (
        <FilterChip
          key={f.key}
          label={f.label}
          active={activeKey === f.key}
          onPress={() => onSelect(f.key)}
          count={getCount?.(f.key)}
        />
      ))}
    </ScrollView>
  );
}
