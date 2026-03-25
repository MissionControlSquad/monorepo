import { View, ActivityIndicator } from "react-native";

export function ScreenLoading() {
  return (
    <View className="flex-1 justify-center items-center">
      <ActivityIndicator size="large" color="#2563eb" />
    </View>
  );
}
