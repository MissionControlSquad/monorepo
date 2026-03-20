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
import { useState } from "react";
import { useRouter } from "expo-router";
import { useMutation } from "urql";
import { CREATE_TASK_FROM_DASHBOARD } from "@agentcenter/graphql-client";

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
type Priority = (typeof PRIORITIES)[number];

const PRIORITY_COLORS: Record<string, string> = {
  low: "#6b7280",
  medium: "#d97706",
  high: "#dc2626",
  urgent: "#7c3aed",
};

export default function CreateTaskScreen() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority | null>(null);

  const [, createTask] = useMutation(CREATE_TASK_FROM_DASHBOARD);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert("Missing title", "Please enter a task title.");
      return;
    }
    setLoading(true);
    const res = await createTask({
      title: title.trim(),
      description: description.trim(),
      priority: priority ?? undefined,
      assigneeIds: [],
    });
    setLoading(false);

    if (res.error) {
      Alert.alert("Error", res.error.message || "Failed to create task");
    } else {
      router.back();
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#f9fafb" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Title */}
        <View style={styles.field}>
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="What needs to be done?"
            placeholderTextColor="#9ca3af"
            value={title}
            onChangeText={setTitle}
            autoFocus
            returnKeyType="next"
          />
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Add more context…"
            placeholderTextColor="#9ca3af"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Priority */}
        <View style={styles.field}>
          <Text style={styles.label}>Priority</Text>
          <View style={styles.priorityRow}>
            <TouchableOpacity
              style={[styles.priorityChip, priority === null && styles.priorityChipActive]}
              onPress={() => setPriority(null)}
              activeOpacity={0.7}
            >
              <Text style={[styles.priorityChipText, priority === null && { color: "#2563eb" }]}>
                None
              </Text>
            </TouchableOpacity>
            {PRIORITIES.map((p) => (
              <TouchableOpacity
                key={p}
                style={[
                  styles.priorityChip,
                  priority === p && {
                    backgroundColor: PRIORITY_COLORS[p] + "18",
                    borderColor: PRIORITY_COLORS[p],
                  },
                ]}
                onPress={() => setPriority(p)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.priorityChipText,
                    { textTransform: "capitalize" },
                    priority === p && { color: PRIORITY_COLORS[p], fontWeight: "600" },
                  ]}
                >
                  {p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.createBtn, (!title.trim() || loading) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={!title.trim() || loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createBtnText}>Create Task</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 20,
  },
  field: { gap: 6 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  priorityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  priorityChip: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  priorityChipActive: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  priorityChipText: {
    fontSize: 13,
    color: "#6b7280",
  },
  createBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  createBtnDisabled: {
    opacity: 0.5,
  },
  createBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  cancelBtnText: {
    fontSize: 15,
    color: "#6b7280",
  },
});
