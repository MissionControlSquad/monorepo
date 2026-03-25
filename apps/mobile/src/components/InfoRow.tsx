import { View, Text } from "react-native";

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text className="text-sm text-gray-500 dark:text-slate-400">{label}</Text>
      <Text
        className="text-sm font-medium text-gray-900 dark:text-slate-100 flex-1 text-right"
        numberOfLines={2}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}
