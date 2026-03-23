import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState, useEffect } from "react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useQuery, useMutation } from "urql";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AGENT_EDIT_QUERY, UPDATE_AGENT_PROFILE } from "@agentcenter/graphql-client";
import { AGENT_EMOJI_PRESETS, DEFAULT_AGENT_EMOJI } from "@agentcenter/utils";

export default function EditAgentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [emoji, setEmoji] = useState(DEFAULT_AGENT_EMOJI);
  const [personality, setPersonality] = useState("");
  const [dirty, setDirty] = useState(false);

  const [result] = useQuery({
    query: AGENT_EDIT_QUERY,
    variables: { id },
    requestPolicy: "network-only",
  });

  const [{ fetching: saving }, updateProfile] = useMutation(UPDATE_AGENT_PROFILE);

  const agent = result.data?.agent;

  useEffect(() => {
    if (agent) {
      navigation.setOptions({ title: `Edit ${agent.name}` });
      setName(agent.name ?? "");
      setRole(agent.role ?? "");
      setEmoji(agent.identityEmoji ?? DEFAULT_AGENT_EMOJI);
      setPersonality(agent.personality ?? "");
    }
  }, [agent, navigation]);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert("Required", "Name is required"); return; }
    if (!role.trim()) { Alert.alert("Required", "Role is required"); return; }

    const res = await updateProfile({
      id,
      name: name.trim(),
      role: role.trim(),
      identityEmoji: emoji,
      personality: personality.trim() || null,
    });

    if (res.error) {
      Alert.alert("Error", res.error.message || "Failed to save");
    } else {
      setDirty(false);
      router.back();
    }
  };

  const track = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setDirty(true);
  };

  if (result.fetching && !agent) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

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
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Identity</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Name <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={track(setName)}
              placeholder="Agent name"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Role <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={role}
              onChangeText={track(setRole)}
              placeholder="e.g. Backend Engineer"
              placeholderTextColor="#9ca3af"
            />
          </View>

          {agent?.username ? (
            <View style={styles.field}>
              <Text style={styles.label}>Username</Text>
              <View style={[styles.input, { backgroundColor: "#f3f4f6", justifyContent: "center" }]}>
                <Text style={{ fontSize: 14, color: "#9ca3af" }}>@{agent.username}</Text>
              </View>
              <Text style={{ fontSize: 11, color: "#9ca3af" }}>Username cannot be changed after creation</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Emoji</Text>
            <View style={styles.emojiGrid}>
              {AGENT_EMOJI_PRESETS.map((e) => (
                <TouchableOpacity
                  key={e}
                  style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]}
                  onPress={() => { setEmoji(e); setDirty(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.emojiChar}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Personality & Instructions</Text>
          <Text style={styles.hint}>
            Define the agent's working style, expertise, and behaviour guidelines.
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={personality}
            onChangeText={track(setPersonality)}
            placeholder="Describe how this agent should behave…"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={8}
            textAlignVertical="top"
          />
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

        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151" },
  required: { color: "#dc2626" },
  hint: { fontSize: 12, color: "#9ca3af" },
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
  textArea: { minHeight: 140, paddingTop: 11 },

  emojiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  emojiBtnActive: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  emojiChar: { fontSize: 22 },

  saveBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  cancelBtn: { alignItems: "center", paddingVertical: 10 },
  cancelBtnText: { fontSize: 15, color: "#6b7280" },
});
