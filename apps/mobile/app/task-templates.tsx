import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  TASK_TEMPLATES_QUERY,
  CREATE_TASK_TEMPLATE,
  UPDATE_TASK_TEMPLATE,
  DELETE_TASK_TEMPLATE,
} from "@agentcenter/graphql-client";
import { formatDate } from "@agentcenter/utils";
import { useTheme } from "../src/hooks/useTheme";
import { EmptyState } from "../src/components/EmptyState";

interface SubtaskDef {
  title: string;
  description?: string;
}

interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;
  subtasks: string; // JSON string of SubtaskDef[]
  createdAt: string;
  updatedAt: string;
}

function parseSubtasks(raw: string): SubtaskDef[] {
  try {
    return JSON.parse(raw) as SubtaskDef[];
  } catch {
    return [];
  }
}



// ── Template Form Modal ───────────────────────────────────────────────────────

function TemplateFormModal({
  visible,
  initial,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initial: TaskTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [subtasks, setSubtasks] = useState<SubtaskDef[]>(initial ? parseSubtasks(initial.subtasks) : []);
  const [subtaskInput, setSubtaskInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [, createTemplate] = useMutation(CREATE_TASK_TEMPLATE);
  const [, updateTemplate] = useMutation(UPDATE_TASK_TEMPLATE);

  function addSubtask() {
    const t = subtaskInput.trim();
    if (!t) return;
    setSubtasks((prev) => [...prev, { title: t }]);
    setSubtaskInput("");
  }

  function removeSubtask(i: number) {
    setSubtasks((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert("Missing name", "Template name is required.");
      return;
    }
    setLoading(true);
    const subtasksJson = JSON.stringify(subtasks);
    let error: Error | undefined;
    if (isEdit && initial) {
      const res = await updateTemplate({ id: initial.id, name: name.trim(), description: description.trim() || undefined, subtasks: subtasksJson });
      if (res.error) error = res.error;
    } else {
      const res = await createTemplate({ name: name.trim(), description: description.trim() || undefined, subtasks: subtasksJson });
      if (res.error) error = res.error;
    }
    setLoading(false);
    if (error) {
      Alert.alert("Error", error.message ?? "Failed to save");
    } else {
      onSaved();
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 16, color: colors.textSecondary }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text }}>
            {isEdit ? "Edit Template" : "New Template"}
          </Text>
          <TouchableOpacity onPress={handleSave} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.accent} /> : (
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.accent }}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
          {/* Name */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary }}>Name *</Text>
            <TextInput
              style={{ backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text }}
              placeholder="Template name…"
              placeholderTextColor={colors.placeholder}
              value={name}
              onChangeText={setName}
              autoFocus={!isEdit}
            />
          </View>

          {/* Description */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary }}>Description</Text>
            <TextInput
              style={{ backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, minHeight: 70, textAlignVertical: "top" }}
              placeholder="What this template is for…"
              placeholderTextColor={colors.placeholder}
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </View>

          {/* Subtasks */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary }}>Subtasks ({subtasks.length})</Text>
            {subtasks.map((s, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, gap: 10 }}>
                <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{s.title}</Text>
                <TouchableOpacity onPress={() => removeSubtask(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ color: colors.danger, fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                style={{ flex: 1, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text }}
                placeholder="Add subtask…"
                placeholderTextColor={colors.placeholder}
                value={subtaskInput}
                onChangeText={setSubtaskInput}
                onSubmitEditing={addSubtask}
                returnKeyType="done"
                blurOnSubmit={false}
              />
              <TouchableOpacity
                onPress={addSubtask}
                style={{ backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" }}
                activeOpacity={0.7}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function TaskTemplatesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<TaskTemplate | null>(null);

  const [result, reexecute] = useQuery<{ taskTemplates: TaskTemplate[] }>({
    query: TASK_TEMPLATES_QUERY,
    requestPolicy: "cache-and-network",
  });

  const [, deleteTemplate] = useMutation(DELETE_TASK_TEMPLATE);

  const templates = result.data?.taskTemplates ?? [];

  function handleDelete(template: TaskTemplate) {
    Alert.alert(
      "Delete Template",
      `Delete "${template.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const res = await deleteTemplate({ id: template.id });
            if (res.error) Alert.alert("Error", res.error.message ?? "Failed to delete");
            else reexecute({ requestPolicy: "network-only" });
          },
        },
      ]
    );
  }

  function handleLongPress(template: TaskTemplate) {
    Alert.alert(template.name, undefined, [
      { text: "✏️ Edit", onPress: () => { setEditing(template); setFormVisible(true); } },
      { text: "🗑️ Delete", style: "destructive", onPress: () => handleDelete(template) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  if (result.fetching && templates.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Toolbar */}
      <View style={{ flexDirection: "row", padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, justifyContent: "flex-end" }}>
        <TouchableOpacity
          onPress={() => { setEditing(null); setFormVisible(true); }}
          style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.accent }}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>+ New Template</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={templates}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24 }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={result.fetching && templates.length > 0}
            onRefresh={() => reexecute({ requestPolicy: "network-only" })}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="document-text-outline"
            message="No task templates yet"
            action={{ label: "Create template", onPress: () => { setEditing(null); setFormVisible(true); } }}
          />
        }
        renderItem={({ item }) => {
          const subtasks = parseSubtasks(item.subtasks);
          return (
            <TouchableOpacity
              style={{ backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 8 }}
              onLongPress={() => handleLongPress(item)}
              onPress={() => { setEditing(item); setFormVisible(true); }}
              delayLongPress={400}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 16 }}>📋</Text>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: colors.text }} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>{formatDate(item.updatedAt)}</Text>
              </View>

              {item.description ? (
                <Text style={{ fontSize: 13, color: colors.textSecondary }} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}

              {subtasks.length > 0 && (
                <View style={{ gap: 3 }}>
                  {subtasks.slice(0, 3).map((s, i) => (
                    <Text key={i} style={{ fontSize: 12, color: colors.textMuted }}>
                      · {s.title}
                    </Text>
                  ))}
                  {subtasks.length > 3 && (
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>
                      +{subtasks.length - 3} more subtasks
                    </Text>
                  )}
                </View>
              )}

              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ backgroundColor: colors.accentSurface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, color: colors.accent, fontWeight: "600" }}>
                    {subtasks.length} subtask{subtasks.length !== 1 ? "s" : ""}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <TemplateFormModal
        visible={formVisible}
        initial={editing}
        onClose={() => { setFormVisible(false); setEditing(null); }}
        onSaved={() => {
          setFormVisible(false);
          setEditing(null);
          reexecute({ requestPolicy: "network-only" });
        }}
      />
    </View>
  );
}
