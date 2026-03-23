import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Pressable,
  Image,
  Alert,
  useWindowDimensions,
} from "react-native";
import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useDrawer } from "../context/DrawerContext";
import { useAuth } from "../context/AuthContext";
import { useQuery } from "urql";
import { ME_QUERY } from "@agentcenter/graphql-client";
import { getStoredServerUrl } from "../api/session";
import { useTheme } from "../hooks/useTheme";
import { useNotificationCount } from "../hooks/useNotificationCount";

interface Profile {
  id: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  user: { id: string; email: string } | null;
}

const DRAWER_WIDTH = 280;

export function AppDrawer() {
  const { isOpen, closeDrawer } = useDrawer();
  const { onLogout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { colors } = useTheme();

  const translateX = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const [result] = useQuery<{ me: Profile | null }>({
    query: ME_QUERY,
    requestPolicy: "cache-and-network",
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
          toValue: DRAWER_WIDTH,
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

  const initials = profile?.displayName?.[0]?.toUpperCase() ?? "?";

  return (
    <View style={{ ...{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } }} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)", opacity }}>
        <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} onPress={closeDrawer} />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: Math.min(DRAWER_WIDTH, screenWidth * 0.78),
          backgroundColor: colors.background,
          shadowColor: colors.shadow,
          shadowOffset: { width: -3, height: 0 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 20,
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 16,
          transform: [{ translateX }],
        }}
      >
        {/* Close button */}
        <TouchableOpacity
          style={{ alignSelf: "flex-end", padding: 12, marginRight: 4 }}
          onPress={closeDrawer}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Profile section */}
        <View style={{ alignItems: "center", paddingHorizontal: 20, paddingBottom: 20, gap: 4 }}>
          {profile?.avatarUrl ? (
            <Image
              source={{
                uri: profile.avatarUrl.startsWith("http")
                  ? profile.avatarUrl
                  : `${getStoredServerUrl() ?? ""}${profile.avatarUrl}`,
              }}
              style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 8 }}
            />
          ) : (
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: colors.accentSurface,
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 28, fontWeight: "700", color: colors.accent }}>
                {initials}
              </Text>
            </View>
          )}
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text }} numberOfLines={1}>
            {profile?.displayName ?? "…"}
          </Text>
          {profile?.username ? (
            <Text style={{ fontSize: 13, color: colors.textSecondary }} numberOfLines={1}>
              @{profile.username}
            </Text>
          ) : null}
          {profile?.user?.email ? (
            <Text style={{ fontSize: 12, color: colors.textMuted }} numberOfLines={1}>
              {profile.user.email}
            </Text>
          ) : null}
        </View>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: colors.divider }} />

        {/* Navigation items */}
        <View style={{ paddingVertical: 8 }}>
          <DrawerItem icon="search-outline" label="Search" onPress={() => navigate("/search")} colors={colors} />
          <DrawerItem icon="person-outline" label="Profile" onPress={() => navigate("/profile")} colors={colors} />
          <DrawerItem icon="pulse-outline" label="Activity Feed" onPress={() => navigate("/activity")} colors={colors} />
          <DrawerItem icon="bar-chart-outline" label="Analytics" onPress={() => navigate("/analytics")} colors={colors} />
          <DrawerItem icon="repeat-outline" label="Recurring Tasks" onPress={() => navigate("/recurring-tasks")} colors={colors} />
          <DrawerItem icon="document-text-outline" label="Task Templates" onPress={() => navigate("/task-templates")} colors={colors} />
          <DrawerItem icon="notifications-outline" label="Notifications" onPress={() => navigate("/notifications")} colors={colors} badge={notificationCount > 0 ? (notificationCount > 99 ? "99+" : String(notificationCount)) : undefined} />
          <DrawerItem icon="server-outline" label="Cloud VMs" onPress={() => navigate("/cloud")} colors={colors} />
          <DrawerItem icon="toggle-outline" label="Feature Flags" onPress={() => navigate("/feature-flags")} colors={colors} />
          <DrawerItem icon="settings-outline" label="Settings" onPress={() => navigate("/settings")} colors={colors} />
        </View>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: colors.divider }} />

        {/* Sign out */}
        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14, marginTop: "auto" }}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.danger }}>Sign Out</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function DrawerItem({
  icon,
  label,
  onPress,
  colors,
  badge,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  badge?: string;
}) {
  return (
    <TouchableOpacity
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: colors.navIconBg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Ionicons name={icon} size={20} color={colors.icon} />
      </View>
      <Text style={{ fontSize: 15, fontWeight: "500", color: colors.text }}>{label}</Text>
      {badge ? (
        <View style={{ marginLeft: "auto", marginRight: 4, backgroundColor: "#dc2626", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, minWidth: 20, alignItems: "center" }}>
          <Text style={{ fontSize: 11, color: "#fff", fontWeight: "700" }}>{badge}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.border} style={{ marginLeft: "auto" }} />
      )}
    </TouchableOpacity>
  );
}
