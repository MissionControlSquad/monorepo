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
import { CREATE_PROJECT } from "@agentcenter/graphql-client";

export default function CreateProjectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [, createProject] = useMutation(CREATE_PROJECT);
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      Alert.alert("Error", "Project name is required");
      return;
    }
    setSaving(true);
    const res = await createProject({
      name: name.trim(),
      description: description.trim() || undefined,
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
  createBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
