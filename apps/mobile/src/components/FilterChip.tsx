import { TouchableOpacity, Text } from "react-native";

export function FilterChip({
  label,
  active,
  onPress,
  count,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  count?: number;
}) {
  return (
    <TouchableOpacity
      className={`px-3.5 rounded-full border items-center justify-center ${
        active
          ? "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700"
          : "bg-gray-100 dark:bg-slate-700 border-gray-200 dark:border-slate-600"
      }`}
      style={{ minHeight: 20, maxHeight: 20 }}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        className={`text-sm ${
          active
            ? "text-blue-600 dark:text-blue-400 font-semibold"
            : "text-gray-500 dark:text-slate-400 font-medium"
        }`}
        numberOfLines={1}
      >
        {count !== undefined ? `${label} (${count})` : label}
      </Text>
    </TouchableOpacity>
  );
}
