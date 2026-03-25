import "../global.css";
import { Stack, useRouter } from "expo-router";
import { Provider } from "urql";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { DrawerProvider } from "../src/context/DrawerContext";
import { NotificationCountProvider } from "../src/context/NotificationCountContext";
import { AppDrawer } from "../src/components/AppDrawer";
import { OfflineBanner } from "../src/components/OfflineBanner";
import { usePushNotifications } from "../src/hooks/usePushNotifications";
import { View, ActivityIndicator, useColorScheme } from "react-native";
import { useEffect } from "react";

function RootLayoutNav() {
  const { urqlClient, isLoading, isSignedIn } = useAuth();
  const isDark = useColorScheme() === "dark";
  const router = useRouter();
  usePushNotifications();

  // Imperatively redirect when auth state changes (e.g. after logout from any screen)
  useEffect(() => {
    if (!isLoading && !isSignedIn) {
      router.replace("/auth/login");
    }
  }, [isSignedIn, isLoading]);

  // While restoring session show a neutral splash
  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900">
        <ActivityIndicator size="large" color={isDark ? "#3b82f6" : "#2563eb"} />
      </View>
    );
  }

  // ── Not signed in ──────────────────────────────────────────────────────────
  // Render ONLY the auth stack — no urql Provider so zero API calls can fire.
  // All protected route names are still declared so expo-router doesn't warn,
  // but they redirect back to login via the effect above if somehow reached.
  if (!isSignedIn) {
    return (
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: isDark ? "#0f172a" : "#ffffff" },
          headerTintColor: isDark ? "#f1f5f9" : "#111827",
          headerTitleStyle: { color: isDark ? "#f1f5f9" : "#111827" },
          contentStyle: { backgroundColor: isDark ? "#0f172a" : "#ffffff" },
        }}
      >
        <Stack.Screen name="auth/login" options={{ headerShown: false }} />
        <Stack.Screen name="auth/reset-password" options={{ title: "Reset Password" }} />
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(dashboard)" options={{ headerShown: false }} />
      </Stack>
    );
  }

  // ── Signed in ──────────────────────────────────────────────────────────────
  // Full app wrapped in urql Provider so GraphQL queries work.
  return (
    <Provider value={urqlClient}>
      <NotificationCountProvider>
      <View className="flex-1 bg-white dark:bg-slate-900">
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
          <Stack.Screen name="auth/reset-password" options={{ title: "Reset Password" }} />
          <Stack.Screen name="(dashboard)" options={{ headerShown: false }} />
          <Stack.Screen name="task/[id]" options={{ title: "Task Details" }} />
          <Stack.Screen name="task/create" options={{ title: "New Task", presentation: "modal" }} />
          <Stack.Screen name="task/edit" options={{ title: "Edit Task" }} />
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
          <Stack.Screen name="task-templates" options={{ title: "Task Templates" }} />
          <Stack.Screen name="feature-flags" options={{ title: "Feature Flags" }} />
          <Stack.Screen name="search" options={{ title: "Search" }} />
          <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
          <Stack.Screen name="channels/create" options={{ title: "New Channel", presentation: "modal" }} />
          <Stack.Screen name="kanban/[projectId]" options={{ title: "Kanban" }} />
          <Stack.Screen name="profile" options={{ title: "Profile", presentation: "modal" }} />
          <Stack.Screen name="settings" options={{ title: "Settings", presentation: "modal" }} />
          <Stack.Screen name="cloud" options={{ title: "Cloud VMs" }} />
          <Stack.Screen name="cloud/[id]" options={{ title: "VM" }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack>
        <AppDrawer />
      </View>
      </NotificationCountProvider>
    </Provider>
  );
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
