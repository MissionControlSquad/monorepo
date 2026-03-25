import { View, Text, TouchableOpacity, useColorScheme } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface EmptyStateProps {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  message: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ icon = "cube-outline", message, action }: EmptyStateProps) {
  const isDark = useColorScheme() === "dark";

  return (
    <View className="flex-1 justify-center items-center gap-3 p-8">
      <Ionicons name={icon} size={48} color={isDark ? "#64748b" : "#9ca3af"} />
      <Text className="text-gray-400 dark:text-slate-500 text-base text-center leading-6">
        {message}
      </Text>
      {action && (
        <TouchableOpacity
          className="bg-blue-600 dark:bg-blue-500 rounded-lg px-4 py-2 mt-1"
          onPress={action.onPress}
        >
          <Text className="text-white font-semibold text-sm">{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
