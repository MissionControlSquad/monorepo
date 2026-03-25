import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity, View, useColorScheme } from "react-native";
import { useDrawer } from "../../src/context/DrawerContext";
import { NotificationBell } from "../../src/components/NotificationBell";

export default function DashboardLayout() {
  const { openDrawer } = useDrawer();
  const router = useRouter();
  const isDark = useColorScheme() === "dark";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: isDark ? "#3b82f6" : "#2563eb",
        tabBarInactiveTintColor: isDark ? "#64748b" : "#9ca3af",
        tabBarStyle: {
          borderTopColor: isDark ? "#334155" : "#e5e7eb",
          backgroundColor: isDark ? "#0f172a" : "#ffffff",
        },
        headerStyle: { backgroundColor: isDark ? "#0f172a" : "#ffffff" },
        headerTitleStyle: { fontWeight: "600", color: isDark ? "#f1f5f9" : "#111827" },
        headerShadowVisible: false,
        headerRight: () => (
          <TouchableOpacity onPress={openDrawer} className="mr-4">
            <Ionicons name="person-circle-outline" size={26} color={isDark ? "#94a3b8" : "#6b7280"} />
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Tasks",
          tabBarLabel: "Tasks",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-circle-outline" size={size} color={color} />
          ),
          headerRight: () => (
            <View className="flex-row items-center gap-1 mr-2">
              <TouchableOpacity onPress={() => router.push("/search")} className="p-2">
                <Ionicons name="search-outline" size={22} color={isDark ? "#94a3b8" : "#6b7280"} />
              </TouchableOpacity>
              <NotificationBell
                onPress={() => router.push("/notifications")}
                color={isDark ? "#94a3b8" : "#6b7280"}
              />
              <TouchableOpacity onPress={openDrawer} className="p-2">
                <Ionicons name="person-circle-outline" size={26} color={isDark ? "#94a3b8" : "#6b7280"} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="agents"
        options={{
          title: "Agents",
          tabBarLabel: "Agents",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
          headerRight: () => (
            <View className="flex-row items-center gap-1 mr-2">
              <TouchableOpacity onPress={() => router.push("/agent/create")} className="p-2">
                <Ionicons name="add" size={26} color={isDark ? "#3b82f6" : "#2563eb"} />
              </TouchableOpacity>
              <TouchableOpacity onPress={openDrawer} className="p-2">
                <Ionicons name="person-circle-outline" size={26} color={isDark ? "#94a3b8" : "#6b7280"} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="channels"
        options={{
          title: "Channels",
          tabBarLabel: "Channels",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-outline" size={size} color={color} />
          ),
          headerRight: () => (
            <View className="flex-row items-center gap-1 mr-2">
              <TouchableOpacity onPress={() => router.push("/channels/create")} className="p-2">
                <Ionicons name="add" size={26} color={isDark ? "#3b82f6" : "#2563eb"} />
              </TouchableOpacity>
              <TouchableOpacity onPress={openDrawer} className="p-2">
                <Ionicons name="person-circle-outline" size={26} color={isDark ? "#94a3b8" : "#6b7280"} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "Projects",
          tabBarLabel: "Projects",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="folder-outline" size={size} color={color} />
          ),
          headerRight: () => (
            <View className="flex-row items-center gap-1 mr-2">
              <TouchableOpacity onPress={() => router.push("/project/create")} className="p-2">
                <Ionicons name="add" size={26} color={isDark ? "#3b82f6" : "#2563eb"} />
              </TouchableOpacity>
              <TouchableOpacity onPress={openDrawer} className="p-2">
                <Ionicons name="person-circle-outline" size={26} color={isDark ? "#94a3b8" : "#6b7280"} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
