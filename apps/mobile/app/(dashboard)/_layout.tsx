import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity, View } from "react-native";
import { useDrawer } from "../../src/context/DrawerContext";
import { useTheme } from "../../src/hooks/useTheme";

export default function DashboardLayout() {
  const { openDrawer } = useDrawer();
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.tabBar,
        },
        headerStyle: { backgroundColor: colors.headerBg },
        headerTitleStyle: { fontWeight: "600", color: colors.text },
        headerShadowVisible: false,
        headerRight: () => (
          <TouchableOpacity onPress={openDrawer} style={{ marginRight: 16 }}>
            <Ionicons name="person-circle-outline" size={26} color={colors.textSecondary} />
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginRight: 8 }}>
              <TouchableOpacity onPress={() => router.push("/notifications")} style={{ padding: 8 }}>
                <Ionicons name="notifications-outline" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={openDrawer} style={{ padding: 8 }}>
                <Ionicons name="person-circle-outline" size={26} color={colors.textSecondary} />
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginRight: 8 }}>
              <TouchableOpacity onPress={() => router.push("/agent/create")} style={{ padding: 8 }}>
                <Ionicons name="add" size={26} color={colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={openDrawer} style={{ padding: 8 }}>
                <Ionicons name="person-circle-outline" size={26} color={colors.textSecondary} />
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginRight: 8 }}>
              <TouchableOpacity onPress={() => router.push("/channels/create")} style={{ padding: 8 }}>
                <Ionicons name="add" size={26} color={colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={openDrawer} style={{ padding: 8 }}>
                <Ionicons name="person-circle-outline" size={26} color={colors.textSecondary} />
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginRight: 8 }}>
              <TouchableOpacity onPress={() => router.push("/project/create")} style={{ padding: 8 }}>
                <Ionicons name="add" size={26} color={colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={openDrawer} style={{ padding: 8 }}>
                <Ionicons name="person-circle-outline" size={26} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
