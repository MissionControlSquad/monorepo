import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
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
      setAvatarUrl(profile.avatarUrl ?? null);
      setDirty(false);
    }
  }, [profile]);

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Please allow access to your photo library.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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

      const res = await fetch(`${serverUrl}/api/profile/avatar`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Upload failed");
      }

      const { avatarUrl: newUrl } = await res.json();
      setAvatarUrl(newUrl);
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

  if (result.fetching && !profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const initials = displayName.trim()[0]?.toUpperCase() ?? "?";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#f9fafb" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar card */}
        <View style={styles.card}>
          <View style={styles.avatarRow}>
            {/* Avatar */}
            <TouchableOpacity
              style={styles.avatarContainer}
              onPress={handlePickAvatar}
              disabled={uploading}
              activeOpacity={0.8}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
              <View style={styles.avatarOverlay}>
                {uploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={18} color="#fff" />
                )}
              </View>
            </TouchableOpacity>

            {/* Identity info */}
            <View style={styles.identityInfo}>
              <Text style={styles.identityName} numberOfLines={1}>
                {displayName || "Your Name"}
              </Text>
              {profile?.username ? (
                <Text style={styles.identityUsername} numberOfLines={1}>
                  @{profile.username}
                </Text>
              ) : null}
              {profile?.user?.email ? (
                <View style={styles.emailRow}>
                  <Ionicons name="mail-outline" size={12} color="#9ca3af" />
                  <Text style={styles.identityEmail} numberOfLines={1}>
                    {profile.user.email}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Avatar hint / remove */}
          <View style={styles.avatarHintRow}>
            {uploading ? (
              <Text style={styles.avatarHint}>Uploading avatar…</Text>
            ) : (
              <>
                <Text style={styles.avatarHint}>
                  Tap avatar to upload (PNG, JPEG, GIF, WebP · max 5 MB)
                </Text>
                {avatarUrl ? (
                  <TouchableOpacity onPress={handleRemoveAvatar} style={styles.removeBtn}>
                    <Ionicons name="trash-outline" size={12} color="#9ca3af" />
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
        </View>

        {/* Profile info form */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}>
              <Ionicons name="person-outline" size={20} color="#6b7280" />
            </View>
            <View>
              <Text style={styles.cardTitle}>Profile Information</Text>
              <Text style={styles.cardSubtitle}>Update your display name and bio</Text>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>
              Display Name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={(v) => { setDisplayName(v); setDirty(true); }}
              placeholder="Your display name"
              placeholderTextColor="#9ca3af"
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Bio</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={bio}
              onChangeText={(v) => { setBio(v); setDirty(true); }}
              placeholder="Tell us about yourself…"
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Text style={styles.hint}>A short description visible to others</Text>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, (!dirty || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!dirty || saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Account section */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Account</Text>

          {profile?.user?.email ? (
            <View style={styles.accountRow}>
              <Ionicons name="mail-outline" size={16} color="#6b7280" />
              <Text style={styles.accountValue}>{profile.user.email}</Text>
            </View>
          ) : null}

          {profile?.username ? (
            <View style={styles.accountRow}>
              <Ionicons name="at-outline" size={16} color="#6b7280" />
              <Text style={styles.accountValue}>{profile.username}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={16} color="#dc2626" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  content: {
    padding: 16,
    gap: 12,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 12,
  },

  // Avatar
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: "hidden",
    flexShrink: 0,
  },
  avatar: {
    width: 64,
    height: 64,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitials: {
    fontSize: 24,
    fontWeight: "700",
    color: "#2563eb",
  },
  avatarOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 24,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  identityInfo: {
    flex: 1,
    gap: 3,
  },
  identityName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  identityUsername: {
    fontSize: 13,
    color: "#6b7280",
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  identityEmail: {
    fontSize: 12,
    color: "#9ca3af",
    flex: 1,
  },
  avatarHintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  avatarHint: {
    fontSize: 11,
    color: "#9ca3af",
    flex: 1,
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
  },
  removeBtnText: {
    fontSize: 11,
    color: "#9ca3af",
  },

  // Form
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 1,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  required: {
    color: "#dc2626",
  },
  input: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: "#111827",
  },
  textArea: {
    minHeight: 96,
    paddingTop: 11,
  },
  hint: {
    fontSize: 11,
    color: "#9ca3af",
  },
  saveBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },

  // Account section
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  accountValue: {
    fontSize: 14,
    color: "#374151",
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  signOutText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#dc2626",
  },
});
