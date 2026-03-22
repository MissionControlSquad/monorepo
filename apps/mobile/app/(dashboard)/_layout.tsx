import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity, View } from "react-native";
import { useDrawer } from "../../src/context/DrawerContext";

export default function DashboardLayout() {
  const { openDrawer } = useDrawer();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#9ca3af",
        tabBarStyle: {
          borderTopColor: "#e5e7eb",
          backgroundColor: "#fff",
        },
        headerStyle: { backgroundColor: "#fff" },
        headerTitleStyle: { fontWeight: "600", color: "#111827" },
        headerShadowVisible: false,
        headerRight: () => (
          <TouchableOpacity onPress={openDrawer} style={{ marginRight: 16 }}>
            <Ionicons name="person-circle-outline" size={26} color="#6b7280" />
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginRight: 8 }}>
              <TouchableOpacity onPress={() => router.push("/agent/create")} style={{ padding: 8 }}>
                <Ionicons name="add" size={26} color="#2563eb" />
              </TouchableOpacity>
              <TouchableOpacity onPress={openDrawer} style={{ padding: 8 }}>
                <Ionicons name="person-circle-outline" size={26} color="#6b7280" />
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
        }}
      />
    </Tabs>
  );
}
