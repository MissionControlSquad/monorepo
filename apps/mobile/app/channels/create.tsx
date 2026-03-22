import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "urql";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CREATE_CHANNEL } from "@agentcenter/graphql-client";
import { useAuth } from "../../src/context/AuthContext";

type Visibility = "public" | "private" | "dm";

const VISIBILITY_OPTIONS: { key: Visibility; label: string; desc: string }[] = [
  { key: "public", label: "Public", desc: "Anyone can join" },
  { key: "private", label: "Private", desc: "Invite only" },
  { key: "dm", label: "DM", desc: "Direct message" },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

export default function CreateChannelScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profileId } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [saving, setSaving] = useState(false);

  const [, createChannel] = useMutation(CREATE_CHANNEL);

  async function handleCreate() {
    if (!name.trim()) {
      Alert.alert("Error", "Channel name is required");
      return;
    }
    if (!profileId) {
      Alert.alert("Error", "Not logged in");
      return;
    }
    const slug = slugify(name.trim());
    if (!slug) {
      Alert.alert("Error", "Channel name must contain valid characters (letters, numbers)");
      return;
    }

    setSaving(true);
    const res = await createChannel({
      name: name.trim(),
      slug,
      visibility,
      description: description.trim() || undefined,
      createdByProfileId: profileId,
    });
    setSaving(false);

    if (res.error) {
      Alert.alert("Error", res.error.message);
    } else if (res.data?.createChannel?.id) {
      router.replace(`/channels/${res.data.createChannel.id}`);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Name */}
        <View style={styles.field}>
          <Text style={styles.label}>Channel Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. engineering-team"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoFocus
          />
          {name.trim().length > 0 && (
            <Text style={styles.slugPreview}>Slug: #{slugify(name.trim())}</Text>
          )}
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="What is this channel for?"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Visibility */}
        <View style={styles.field}>
          <Text style={styles.label}>Visibility</Text>
          <View style={styles.visibilityRow}>
            {VISIBILITY_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.visibilityCard,
                  visibility === opt.key && styles.visibilityCardActive,
                ]}
                onPress={() => setVisibility(opt.key)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.visibilityLabel,
                    visibility === opt.key && styles.visibilityLabelActive,
                  ]}
                >
                  {opt.label}
                </Text>
                <Text style={styles.visibilityDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.createBtn, saving && { opacity: 0.6 }]}
          onPress={handleCreate}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.createBtnText}>Create Channel</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 20 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151" },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#fff",
  },
  multiline: { height: 80 },
  slugPreview: { fontSize: 12, color: "#9ca3af", marginTop: 2 },

  visibilityRow: { flexDirection: "row", gap: 8 },
  visibilityCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    gap: 2,
  },
  visibilityCardActive: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  visibilityLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  visibilityLabelActive: { color: "#2563eb" },
  visibilityDesc: { fontSize: 10, color: "#9ca3af", textAlign: "center" },

  createBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
