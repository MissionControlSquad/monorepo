import { registerRootComponent } from "expo";
import { View, Text } from "react-native";

function App() {
  return (
    <View className="flex-1 justify-center items-center bg-white">
      <Text className="text-[20px] text-gray-900">AgentCenter is loading...</Text>
    </View>
  );
}

registerRootComponent(App);
