import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useNavigation } from "expo-router";
import { useQuery, useMutation } from "urql";
import { useEffect, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ME_QUERY, UPDATE_MY_PROFILE } from "@agentcenter/graphql-client";
import { useAuth } from "../src/context/AuthContext";
import { getStoredCookie } from "../src/api/session";
import { ScreenLoading } from "../src/components/ScreenLoading";

interface Profile {
  id: string;
  kind: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  user: { id: string; email: string } | null;
}

export default function ProfileScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { serverUrl, onLogout } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [result, reexecute] = useQuery<{ me: Profile | null }>({
    query: ME_QUERY,
    requestPolicy: "cache-and-network",
  });

  const [{ fetching: saving }, updateProfile] = useMutation(UPDATE_MY_PROFILE);

  const profile = result.data?.me;

  useEffect(() => {
    navigation.setOptions({ title: "Profile" });
  }, [navigation]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName ?? "");
      setBio(profile.bio ?? "");
      // avatarUrl from server may be relative (/api/storage/...) — make absolute
      const raw = profile.avatarUrl ?? null;
      if (raw && !raw.startsWith("http") && serverUrl) {
        setAvatarUrl(`${serverUrl}${raw}`);
      } else {
        setAvatarUrl(raw);
      }
      setDirty(false);
    }
  }, [profile, serverUrl]);

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Please allow access to your photo library.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    if (!serverUrl) {
      Alert.alert("Error", "No server URL configured");
      return;
    }

    setUploading(true);
    try {
      const uri = asset.uri;
      const fileName = uri.split("/").pop() ?? "avatar.jpg";
      const mimeType = asset.mimeType ?? "image/jpeg";

      const formData = new FormData();
      formData.append("file", { uri, name: fileName, type: mimeType } as unknown as Blob);

      const cookie = getStoredCookie();
      const res = await fetch(`${serverUrl}/api/profile/avatar`, {
        method: "POST",
        credentials: "include",
        headers: {
          ...(cookie ? { Cookie: `mc_session=${cookie}` } : {}),
        },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }

      const { avatarUrl: newUrl } = await res.json();
      // Server returns a relative URL (/api/storage/...) — make it absolute
      const absoluteUrl = newUrl.startsWith("http") ? newUrl : `${serverUrl}${newUrl}`;
      setAvatarUrl(absoluteUrl);
      reexecute({ requestPolicy: "network-only" });
    } catch (err) {
      Alert.alert("Upload failed", (err as Error).message || "Could not upload avatar");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAvatar = () => {
    Alert.alert("Remove Avatar", "Are you sure you want to remove your avatar?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const res = await updateProfile({ avatarUrl: null });
          if (res.error) {
            Alert.alert("Error", "Failed to remove avatar");
          } else {
            setAvatarUrl(null);
          }
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert("Validation", "Display name is required");
      return;
    }
    const res = await updateProfile({
      displayName: displayName.trim(),
      bio: bio.trim() || null,
    });
    if (res.error) {
      Alert.alert("Error", res.error.message || "Failed to save profile");
    } else {
      setDirty(false);
      Alert.alert("Saved", "Profile updated successfully");
    }
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: onLogout },
    ]);
  };

  if (result.fetching && !profile) return <ScreenLoading />;

  const initials = displayName.trim()[0]?.toUpperCase() ?? "?";

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50 dark:bg-slate-900"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar card */}
        <View className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 gap-3">
          <View className="flex-row items-center gap-3.5">
            {/* Avatar */}
            <TouchableOpacity
              className="w-16 h-16 rounded-full overflow-hidden shrink-0"
              onPress={handlePickAvatar}
              disabled={uploading}
              activeOpacity={0.8}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} className="w-16 h-16" />
              ) : (
                <View className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 justify-center items-center">
                  <Text className="text-2xl font-bold text-blue-600 dark:text-blue-400">{initials}</Text>
                </View>
              )}
              <View
                className="absolute bottom-0 left-0 right-0 h-6 justify-center items-center"
                style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={18} color="#fff" />
                )}
              </View>
            </TouchableOpacity>

            {/* Identity info */}
            <View className="flex-1 gap-1">
              <Text className="text-base font-bold text-gray-900 dark:text-slate-100" numberOfLines={1}>
                {displayName || "Your Name"}
              </Text>
              {profile?.username ? (
                <Text className="text-sm text-gray-500 dark:text-slate-400" numberOfLines={1}>
                  @{profile.username}
                </Text>
              ) : null}
              {profile?.user?.email ? (
                <View className="flex-row items-center gap-1 mt-0.5">
                  <Ionicons name="mail-outline" size={12} color="#9ca3af" />
                  <Text className="text-xs text-gray-400 dark:text-slate-500 flex-1" numberOfLines={1}>
                    {profile.user.email}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Avatar hint / remove */}
          <View className="flex-row items-center justify-between gap-2">
            {uploading ? (
              <Text className="text-xs text-gray-400 dark:text-slate-500">Uploading avatar…</Text>
            ) : (
              <>
                <Text className="text-xs text-gray-400 dark:text-slate-500 flex-1">
                  Tap avatar to upload (PNG, JPEG, GIF, WebP · max 5 MB)
                </Text>
                {avatarUrl ? (
                  <TouchableOpacity onPress={handleRemoveAvatar} className="flex-row items-center gap-1 shrink-0">
                    <Ionicons name="trash-outline" size={12} color="#9ca3af" />
                    <Text className="text-xs text-gray-400 dark:text-slate-500">Remove</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
        </View>

        {/* Profile info form */}
        <View className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 gap-3">
          <View className="flex-row items-center gap-3">
            <View className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-slate-700 justify-center items-center">
              <Ionicons name="person-outline" size={20} color="#6b7280" />
            </View>
            <View>
              <Text className="text-base font-bold text-gray-900 dark:text-slate-100">Profile Information</Text>
              <Text className="text-xs text-gray-500 dark:text-slate-400 mt-px">Update your display name and bio</Text>
            </View>
          </View>

          <View className="gap-1.5">
            <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">
              Display Name <Text className="text-red-600 dark:text-red-400">*</Text>
            </Text>
            <TextInput
              className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
              value={displayName}
              onChangeText={(v) => { setDisplayName(v); setDirty(true); }}
              placeholder="Your display name"
              placeholderTextColor="#9ca3af"
              returnKeyType="next"
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Bio</Text>
            <TextInput
              className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
              style={{ minHeight: 96 }}
              value={bio}
              onChangeText={(v) => { setBio(v); setDirty(true); }}
              placeholder="Tell us about yourself…"
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Text className="text-xs text-gray-400 dark:text-slate-500">A short description visible to others</Text>
          </View>

          <TouchableOpacity
            className={`bg-blue-600 rounded-xl py-3.5 items-center mt-1 ${(!dirty || saving) ? "opacity-45" : ""}`}
            onPress={handleSave}
            disabled={!dirty || saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white text-base font-semibold">Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Account section */}
        <View className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 gap-3">
          <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">Account</Text>

          {profile?.user?.email ? (
            <View className="flex-row items-center gap-2.5 py-1">
              <Ionicons name="mail-outline" size={16} color="#6b7280" />
              <Text className="text-sm text-gray-700 dark:text-slate-300">{profile.user.email}</Text>
            </View>
          ) : null}

          {profile?.username ? (
            <View className="flex-row items-center gap-2.5 py-1">
              <Ionicons name="at-outline" size={16} color="#6b7280" />
              <Text className="text-sm text-gray-700 dark:text-slate-300">{profile.username}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            className="flex-row items-center gap-2 py-2.5 mt-1 border-t border-gray-100 dark:border-slate-700"
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={16} color="#dc2626" />
            <Text className="text-base font-semibold text-red-600 dark:text-red-400">Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
