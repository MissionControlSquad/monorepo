import "../global.css";
import { Stack } from "expo-router";
import { Provider } from "urql";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { DrawerProvider } from "../src/context/DrawerContext";
import { AppDrawer } from "../src/components/AppDrawer";
import { OfflineBanner } from "../src/components/OfflineBanner";
import { useTheme } from "../src/hooks/useTheme";
import { usePushNotifications } from "../src/hooks/usePushNotifications";
import { View } from "react-native";

function RootLayoutNav() {
  const { urqlClient } = useAuth();
  const { colors } = useTheme();
  usePushNotifications();

  const content = (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <OfflineBanner />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.headerBg },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="auth/login" options={{ headerShown: false }} />
        <Stack.Screen name="(dashboard)" options={{ headerShown: false }} />
        <Stack.Screen name="task/[id]" options={{ title: "Task Details" }} />
        <Stack.Screen name="task/create" options={{ title: "New Task", presentation: "modal" }} />
        <Stack.Screen name="deliverable/[id]" options={{ title: "Deliverable" }} />
        <Stack.Screen name="agent/create" options={{ title: "New Agent", presentation: "modal" }} />
        <Stack.Screen name="agent/edit" options={{ title: "Edit Agent" }} />
        <Stack.Screen name="agent/[id]" options={{ title: "Agent" }} />
        <Stack.Screen name="channels/[id]" options={{ title: "Channel" }} />
        <Stack.Screen name="project/[id]" options={{ title: "Project" }} />
        <Stack.Screen name="project/create" options={{ title: "New Project", presentation: "modal" }} />
        <Stack.Screen name="activity" options={{ title: "Activity Feed" }} />
        <Stack.Screen name="analytics" options={{ title: "Analytics" }} />
        <Stack.Screen name="recurring-tasks" options={{ title: "Recurring Tasks" }} />
        <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
        <Stack.Screen name="channels/create" options={{ title: "New Channel", presentation: "modal" }} />
        <Stack.Screen name="kanban/[projectId]" options={{ title: "Kanban" }} />
        <Stack.Screen name="profile" options={{ title: "Profile", presentation: "modal" }} />
        <Stack.Screen name="settings" options={{ title: "Settings", presentation: "modal" }} />
      </Stack>
      <AppDrawer />
    </View>
  );

  return <Provider value={urqlClient}>{content}</Provider>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <DrawerProvider>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </DrawerProvider>
    </SafeAreaProvider>
  );
}
