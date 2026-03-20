import "../global.css";
import { Stack } from "expo-router";
import { Provider } from "urql";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/context/AuthContext";

function RootLayoutNav() {
  const { urqlClient } = useAuth();

  const content = (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="auth/login" options={{ headerShown: false }} />
      <Stack.Screen name="(dashboard)" options={{ headerShown: false }} />
      <Stack.Screen name="task/[id]" options={{ title: "Task Details" }} />
      <Stack.Screen name="task/create" options={{ title: "New Task", presentation: "modal" }} />
      <Stack.Screen name="deliverable/[id]" options={{ title: "Deliverable" }} />
      <Stack.Screen name="agent/[id]" options={{ title: "Agent" }} />
      <Stack.Screen name="channels/[id]" options={{ title: "Channel" }} />
    </Stack>
  );

  return <Provider value={urqlClient}>{content}</Provider>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
