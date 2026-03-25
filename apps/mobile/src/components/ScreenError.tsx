import { View, Text, TouchableOpacity } from "react-native";

export function ScreenError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="flex-1 justify-center items-center gap-3">
      <Text className="text-red-600 dark:text-red-400 text-base">{message}</Text>
      <TouchableOpacity onPress={onRetry}>
        <Text className="text-blue-600 dark:text-blue-400 text-sm font-semibold">Retry</Text>
      </TouchableOpacity>
    </View>
  );
}
