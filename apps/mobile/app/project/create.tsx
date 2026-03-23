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
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "urql";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CREATE_PROJECT, PROFILES_QUERY } from "@agentcenter/graphql-client";
import { DEFAULT_AGENT_EMOJI } from "@agentcenter/utils";
import { Ionicons } from "@expo/vector-icons";

interface Profile {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  agentId: string | null;
  agent?: { id: string; name: string; identityEmoji: string | null } | null;
}

export default function CreateProjectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [, createProject] = useMutation(CREATE_PROJECT);
  const [saving, setSaving] = useState(false);

  const [profilesResult] = useQuery<{ profiles: Profile[] }>({
    query: PROFILES_QUERY,
    variables: { limit: 200 },
    requestPolicy: "cache-and-network",
  });

  const profiles = profilesResult.data?.profiles ?? [];

  function toggleProfile(id: string) {
    setSelectedProfileIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleCreate() {
    if (!name.trim()) {
      Alert.alert("Error", "Project name is required");
      return;
    }
    setSaving(true);
    const res = await createProject({
      name: name.trim(),
      description: description.trim() || undefined,
      memberProfileIds: selectedProfileIds.length ? selectedProfileIds : undefined,
    });
    setSaving(false);
    if (res.error) {
      Alert.alert("Error", res.error.message);
    } else if (res.data?.createProject?.id) {
      router.replace(`/project/${res.data.createProject.id}`);
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
        <View style={styles.field}>
          <Text style={styles.label}>Project Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Q2 Marketing Campaign"
            placeholderTextColor="#9ca3af"
            autoFocus
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="What is this project about?"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Members */}
        <View style={styles.field}>
          <View style={styles.membersHeader}>
            <Text style={styles.label}>Members</Text>
            {selectedProfileIds.length > 0 && (
              <Text style={styles.memberCount}>{selectedProfileIds.length} selected</Text>
            )}
          </View>
          {profilesResult.fetching && profiles.length === 0 ? (
            <ActivityIndicator size="small" color="#2563eb" style={{ marginTop: 8 }} />
          ) : (
            <View style={styles.membersList}>
              {profiles.map((profile) => {
                const selected = selectedProfileIds.includes(profile.id);
                const isAgent = profile.agentId != null;
                const emoji = isAgent ? (profile.agent?.identityEmoji ?? DEFAULT_AGENT_EMOJI) : "👤";
                return (
                  <TouchableOpacity
                    key={profile.id}
                    style={[styles.memberRow, selected && styles.memberRowSelected]}
                    onPress={() => toggleProfile(profile.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.memberEmoji}>{emoji}</Text>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {profile.displayName}
                      </Text>
                      <Text style={styles.memberUsername}>@{profile.username}</Text>
                    </View>
                    <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                      {selected && (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.createBtn, saving && { opacity: 0.6 }]}
          onPress={handleCreate}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.createBtnText}>Create Project</Text>
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
  multiline: { height: 100 },
  membersHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  memberCount: { fontSize: 12, color: "#2563eb", fontWeight: "600" },
  membersList: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  memberRowSelected: { backgroundColor: "#eff6ff" },
  memberEmoji: { fontSize: 18, width: 28, textAlign: "center" },
  memberInfo: { flex: 1, gap: 1 },
  memberName: { fontSize: 14, fontWeight: "500", color: "#111827" },
  memberUsername: { fontSize: 12, color: "#9ca3af" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#d1d5db",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  createBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
