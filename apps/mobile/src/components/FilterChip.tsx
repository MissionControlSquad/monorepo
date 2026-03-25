import { TouchableOpacity, Text } from "react-native";

export function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      className={`px-3 py-1.5 rounded-full border ${
        active
          ? "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700"
          : "bg-gray-100 dark:bg-slate-700 border-gray-200 dark:border-slate-600"
      }`}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        className={`text-xs ${
          active
            ? "text-blue-600 dark:text-blue-400 font-semibold"
            : "text-gray-500 dark:text-slate-400 font-medium"
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
