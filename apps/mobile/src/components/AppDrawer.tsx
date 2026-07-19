import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Pressable,
  Image,
  Alert,
  useWindowDimensions,
  useColorScheme,
} from "react-native";
import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useDrawer } from "../context/DrawerContext";
import { useAuth } from "../context/AuthContext";
import { useQuery } from "urql";
import { ME_DRAWER_QUERY } from "@agentcenter/graphql-client";
import { getStoredServerUrl } from "../api/session";
import { useNotificationCount } from "../hooks/useNotificationCount";
import { generateInitials } from "@agentcenter/utils";
import type { ProfileWithUser as Profile } from "@agentcenter/types";

const DRAWER_WIDTH = 280;

export function AppDrawer() {
  const { isOpen, closeDrawer } = useDrawer();
  const { onLogout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isDark = useColorScheme() === "dark";

  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const [result] = useQuery<{ me: Profile | null }>({
    query: ME_DRAWER_QUERY,
    requestPolicy: "cache-only",
    pause: !isOpen,
  });

  const profile = result.data?.me;
  const notificationCount = useNotificationCount();

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 180,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: -DRAWER_WIDTH,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const navigate = (path: string) => {
    closeDrawer();
    setTimeout(() => router.push(path as Parameters<typeof router.push>[0]), 100);
  };

  const handleLogout = () => {
    closeDrawer();
    setTimeout(() => {
      Alert.alert("Sign Out", "Are you sure you want to sign out?", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: onLogout },
      ]);
    }, 150);
  };

  const initials = generateInitials(profile?.displayName ?? "");

  return (
    <View className="absolute inset-0" pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        className="absolute inset-0 bg-black/35"
        style={{ opacity }}
      >
        <Pressable className="absolute inset-0" onPress={closeDrawer} />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View
        className="absolute top-0 bottom-0 left-0 bg-white dark:bg-slate-900"
        style={{
          width: Math.min(DRAWER_WIDTH, screenWidth * 0.78),
          shadowColor: "#000000",
          shadowOffset: { width: 3, height: 0 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 20,
          paddingTop: insets.top,
          paddingBottom: insets.bottom + 16,
          transform: [{ translateX }],
        }}
      >
        {/* Profile section */}
        <View className="px-5 pt-5 pb-4">
          <View className="flex-row items-center justify-between mb-4">
            {profile?.avatarUrl ? (
              <Image
                source={{
                  uri: profile.avatarUrl.startsWith("http")
                    ? profile.avatarUrl
                    : `${getStoredServerUrl() ?? ""}${profile.avatarUrl}`,
                }}
                className="w-14 h-14 rounded-full"
              />
            ) : (
              <View className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 justify-center items-center">
                <Text className="text-2xl font-bold text-blue-600 dark:text-blue-300">
                  {initials}
                </Text>
              </View>
            )}
            <TouchableOpacity
              onPress={closeDrawer}
              activeOpacity={0.7}
              className="p-2"
            >
              <Ionicons name="close" size={22} color={isDark ? "#94a3b8" : "#6b7280"} />
            </TouchableOpacity>
          </View>
          <Text className="text-base font-bold text-gray-900 dark:text-slate-100" numberOfLines={1}>
            {profile?.displayName ?? "…"}
          </Text>
          {profile?.username ? (
            <Text className="text-sm text-gray-500 dark:text-slate-400 mt-0.5" numberOfLines={1}>
              @{profile.username}
            </Text>
          ) : null}
          {profile?.user?.email ? (
            <Text className="text-xs text-gray-400 dark:text-slate-500 mt-0.5" numberOfLines={1}>
              {profile.user.email}
            </Text>
          ) : null}

          {/* Profile & Settings quick actions */}
          <View className="flex-row gap-2 mt-4">
            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-100 dark:bg-slate-700"
              onPress={() => navigate("/profile")}
              activeOpacity={0.7}
            >
              <Ionicons name="person-outline" size={16} color={isDark ? "#cbd5e1" : "#374151"} />
              <Text className="text-xs font-medium text-gray-700 dark:text-slate-200">Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-100 dark:bg-slate-700"
              onPress={() => navigate("/settings")}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={16} color={isDark ? "#cbd5e1" : "#374151"} />
              <Text className="text-xs font-medium text-gray-700 dark:text-slate-200">Settings</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Divider */}
        <View className="h-px bg-gray-100 dark:bg-slate-800" />

        {/* Navigation items */}
        <View className="py-2">
          <DrawerItem icon="search-outline" label="Search" onPress={() => navigate("/search")} isDark={isDark} />
          <DrawerItem icon="pulse-outline" label="Activity Feed" onPress={() => navigate("/activity")} isDark={isDark} />
          <DrawerItem icon="bar-chart-outline" label="Analytics" onPress={() => navigate("/analytics")} isDark={isDark} />
          <DrawerItem icon="repeat-outline" label="Recurring Tasks" onPress={() => navigate("/recurring-tasks")} isDark={isDark} />
          <DrawerItem icon="document-text-outline" label="Task Templates" onPress={() => navigate("/task-templates")} isDark={isDark} />
          <DrawerItem icon="notifications-outline" label="Notifications" onPress={() => navigate("/notifications")} isDark={isDark} badge={notificationCount > 0 ? (notificationCount > 99 ? "99+" : String(notificationCount)) : undefined} />
          {/* <DrawerItem icon="toggle-outline" label="Feature Flags" onPress={() => navigate("/feature-flags")} isDark={isDark} /> */}
        </View>

        {/* Divider */}
        <View className="h-px bg-gray-100 dark:bg-slate-800" />

        {/* Sign out */}
        <TouchableOpacity
          className="flex-row items-center gap-3 px-5 py-3.5 mt-auto"
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={20} color={isDark ? "#f87171" : "#dc2626"} />
          <Text className="text-base font-semibold text-red-600 dark:text-red-400">Sign Out</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function DrawerItem({
  icon,
  label,
  onPress,
  isDark,
  badge,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  isDark: boolean;
  badge?: string;
}) {
  return (
    <TouchableOpacity
      className="flex-row items-center gap-3 px-5 py-3.5"
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 justify-center items-center">
        <Ionicons name={icon} size={20} color={isDark ? "#cbd5e1" : "#374151"} />
      </View>
      <Text className="text-base font-medium text-gray-900 dark:text-slate-100">{label}</Text>
      {badge ? (
        <View className="ml-auto mr-1 bg-red-600 rounded-xl px-1.5 py-0.5 min-w-5 items-center">
          <Text className="text-xs text-white font-bold">{badge}</Text>
        </View>
      ) : (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={isDark ? "#334155" : "#e5e7eb"}
          style={{ marginLeft: "auto" }}
        />
      )}
    </TouchableOpacity>
  );
}
