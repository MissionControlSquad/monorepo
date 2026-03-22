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
  Modal,
  FlatList,
  Pressable,
} from "react-native";
import { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery } from "urql";
import { CREATE_TASK_FROM_DASHBOARD, PROFILES_QUERY } from "@agentcenter/graphql-client";
import { Avatar } from "../../src/components/Avatar";

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
type Priority = (typeof PRIORITIES)[number];

const PRIORITY_COLORS: Record<string, string> = {
  low: "#6b7280",
  medium: "#d97706",
  high: "#dc2626",
  urgent: "#7c3aed",
};

interface Profile {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  agent: { identityEmoji: string | null } | null;
}

export default function CreateTaskScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assigneeModalOpen, setAssigneeModalOpen] = useState(false);

  const [profilesResult] = useQuery<{ profiles: Profile[] }>({
    query: PROFILES_QUERY,
    variables: { limit: 100 },
    pause: !assigneeModalOpen,
  });

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
      assigneeIds: selectedIds,
      projectId: projectId ?? undefined,
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
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
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

        {/* Assignees */}
        <View style={styles.field}>
          <Text style={styles.label}>Assignees</Text>
          <TouchableOpacity
            style={styles.assigneeSelector}
            onPress={() => setAssigneeModalOpen(true)}
            activeOpacity={0.7}
          >
            {selectedIds.length === 0 ? (
              <Text style={styles.assigneePlaceholder}>Tap to assign…</Text>
            ) : (
              <View style={styles.assigneeChips}>
                {selectedIds.map((id) => {
                  const p = profilesResult.data?.profiles.find((x) => x.id === id);
                  return (
                    <View key={id} style={styles.assigneeChip}>
                      <Text style={styles.assigneeChipText}>
                        {p?.agent?.identityEmoji ?? ""} {p?.displayName ?? id}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Assignee picker modal */}
        <Modal
          visible={assigneeModalOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setAssigneeModalOpen(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Assignees</Text>
              <TouchableOpacity onPress={() => setAssigneeModalOpen(false)}>
                <Text style={styles.modalDone}>Done</Text>
              </TouchableOpacity>
            </View>
            {profilesResult.fetching ? (
              <ActivityIndicator style={{ marginTop: 32 }} color="#2563eb" />
            ) : (
              <FlatList
                data={profilesResult.data?.profiles ?? []}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                renderItem={({ item }) => {
                  const selected = selectedIds.includes(item.id);
                  return (
                    <Pressable
                      style={[styles.profileRow, selected && styles.profileRowSelected]}
                      onPress={() =>
                        setSelectedIds((prev) =>
                          selected ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                        )
                      }
                    >
                      <Avatar
                        avatarUrl={item.avatarUrl}
                        displayName={item.displayName}
                        emoji={item.agent?.identityEmoji}
                        size={36}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.profileName}>{item.displayName}</Text>
                        <Text style={styles.profileUsername}>@{item.username}</Text>
                      </View>
                      {selected && <Text style={styles.checkmark}>✓</Text>}
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </Modal>

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
  assigneeSelector: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  assigneePlaceholder: {
    color: "#9ca3af",
    fontSize: 15,
  },
  assigneeChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  assigneeChip: {
    backgroundColor: "#dbeafe",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  assigneeChipText: {
    fontSize: 13,
    color: "#1d4ed8",
    fontWeight: "500",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
  },
  modalDone: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2563eb",
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  profileRowSelected: {
    backgroundColor: "#eff6ff",
  },
  profileName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  profileUsername: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 1,
  },
  checkmark: {
    fontSize: 18,
    color: "#2563eb",
    fontWeight: "700",
  },
});
