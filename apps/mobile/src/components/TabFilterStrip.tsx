import { ScrollView, TouchableOpacity, Text } from "react-native";

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
      className="h-14 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700"
      contentContainerStyle={{
        paddingHorizontal: 12,
        gap: 8,
        flexDirection: "row",
        alignItems: "center",
        height: 52,
      }}
    >
      {filters.map((f) => {
        const active = activeKey === f.key;
        const count = getCount?.(f.key);
        return (
          <TouchableOpacity
            key={f.key}
            className={`px-3.5 py-2 rounded-full ${active ? "bg-blue-100 dark:bg-blue-900/30" : "bg-gray-100 dark:bg-slate-700"}`}
            onPress={() => onSelect(f.key)}
          >
            <Text
              className={`text-sm ${active ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-gray-500 dark:text-slate-400 font-medium"}`}
            >
              {count !== undefined ? `${f.label} (${count})` : f.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
