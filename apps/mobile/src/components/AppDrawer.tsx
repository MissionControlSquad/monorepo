import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
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

  const translateX = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const [result] = useQuery<{ me: Profile | null }>({
    query: ME_QUERY,
    requestPolicy: "cache-and-network",
    pause: !isOpen,
  });

  const profile = result.data?.me;

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
    // small delay so drawer closes before push animation
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
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
      </Animated.View>

      {/* Drawer panel — slides in from right */}
      <Animated.View
        style={[
          styles.drawer,
          {
            transform: [{ translateX }],
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 16,
            right: 0,
            width: Math.min(DRAWER_WIDTH, screenWidth * 0.78),
          },
        ]}
      >
        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={closeDrawer} activeOpacity={0.7}>
          <Ionicons name="close" size={22} color="#6b7280" />
        </TouchableOpacity>

        {/* Profile section */}
        <View style={styles.profileSection}>
          {profile?.avatarUrl ? (
            <Image
              source={{
                uri: profile.avatarUrl.startsWith("http")
                  ? profile.avatarUrl
                  : `${getStoredServerUrl() ?? ""}${profile.avatarUrl}`,
              }}
              style={styles.avatar}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          <Text style={styles.profileName} numberOfLines={1}>
            {profile?.displayName ?? "…"}
          </Text>
          {profile?.username ? (
            <Text style={styles.profileUsername} numberOfLines={1}>
              @{profile.username}
            </Text>
          ) : null}
          {profile?.user?.email ? (
            <Text style={styles.profileEmail} numberOfLines={1}>
              {profile.user.email}
            </Text>
          ) : null}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Navigation items */}
        <View style={styles.nav}>
          <DrawerItem
            icon="person-outline"
            label="Profile"
            onPress={() => navigate("/profile")}
          />
          <DrawerItem
            icon="settings-outline"
            label="Settings"
            onPress={() => navigate("/settings")}
          />
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={20} color="#dc2626" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function DrawerItem({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.navItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.navIconWrap}>
        <Ionicons name={icon} size={20} color="#374151" />
      </View>
      <Text style={styles.navLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color="#d1d5db" style={{ marginLeft: "auto" }} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  drawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: -3, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
    paddingHorizontal: 0,
  },

  closeBtn: {
    alignSelf: "flex-end",
    padding: 12,
    marginRight: 4,
  },

  profileSection: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 4,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 8,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: "700",
    color: "#2563eb",
  },
  profileName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  profileUsername: {
    fontSize: 13,
    color: "#6b7280",
  },
  profileEmail: {
    fontSize: 12,
    color: "#9ca3af",
  },

  divider: {
    height: 1,
    backgroundColor: "#f3f4f6",
    marginHorizontal: 0,
  },

  nav: {
    paddingVertical: 8,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  navIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  navLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },

  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginTop: "auto",
  },
  signOutText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#dc2626",
  },
});
