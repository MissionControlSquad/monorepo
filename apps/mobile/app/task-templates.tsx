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
      <KeyboardAvoidingView
        className="flex-1 bg-gray-50 dark:bg-slate-900"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-row items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
          <TouchableOpacity onPress={onClose}>
            <Text className="text-base text-gray-500 dark:text-slate-400">Cancel</Text>
          </TouchableOpacity>
          <Text className="text-[17px] font-bold text-gray-900 dark:text-slate-100">
            {isEdit ? "Edit Template" : "New Template"}
          </Text>
          <TouchableOpacity onPress={handleSave} disabled={loading}>
            {loading ? <ActivityIndicator color="#2563eb" /> : (
              <Text className="text-base font-bold text-blue-600 dark:text-blue-400">Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Name */}
          <View className="gap-1.5">
            <Text className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">Name *</Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-[10px] px-3.5 py-3 text-[15px] text-gray-900 dark:text-slate-100"
              placeholder="Template name…"
              placeholderTextColor="#9ca3af"
              value={name}
              onChangeText={setName}
              autoFocus={!isEdit}
            />
          </View>

          {/* Description */}
          <View className="gap-1.5">
            <Text className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">Description</Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-[10px] px-3.5 py-3 text-[15px] text-gray-900 dark:text-slate-100"
              style={{ minHeight: 70, textAlignVertical: "top" }}
              placeholder="What this template is for…"
              placeholderTextColor="#9ca3af"
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </View>

          {/* Subtasks */}
          <View className="gap-2">
            <Text className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">Subtasks ({subtasks.length})</Text>
            {subtasks.map((s, i) => (
              <View key={i} className="flex-row items-center bg-white dark:bg-slate-800 rounded-lg px-3 py-2.5 gap-2.5">
                <Text className="flex-1 text-[14px] text-gray-900 dark:text-slate-100">{s.title}</Text>
                <TouchableOpacity onPress={() => removeSubtask(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text className="text-base text-red-600 dark:text-red-400">✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            <View className="flex-row gap-2">
              <TextInput
                className="flex-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-[10px] px-3 py-2.5 text-[14px] text-gray-900 dark:text-slate-100"
                placeholder="Add subtask…"
                placeholderTextColor="#9ca3af"
                value={subtaskInput}
                onChangeText={setSubtaskInput}
                onSubmitEditing={addSubtask}
                returnKeyType="done"
                blurOnSubmit={false}
              />
              <TouchableOpacity
                onPress={addSubtask}
                className="bg-blue-600 rounded-[10px] px-3.5 justify-center"
                activeOpacity={0.7}
              >
                <Text className="text-white font-bold">Add</Text>
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
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900">
        <ActivityIndicator color="#2563eb" size="large" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-slate-900">
      {/* Toolbar */}
      <View className="flex-row p-3 border-b border-gray-200 dark:border-slate-700 justify-end">
        <TouchableOpacity
          onPress={() => { setEditing(null); setFormVisible(true); }}
          className="px-3.5 py-[7px] rounded-lg bg-blue-600"
          activeOpacity={0.7}
        >
          <Text className="text-[13px] font-bold text-white">+ New Template</Text>
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
            tintColor="#2563eb"
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
              className="bg-white dark:bg-slate-800 rounded-[12px] p-3.5 border border-gray-200 dark:border-slate-700 gap-2"
              onLongPress={() => handleLongPress(item)}
              onPress={() => { setEditing(item); setFormVisible(true); }}
              delayLongPress={400}
              activeOpacity={0.7}
            >
              <View className="flex-row items-center gap-2">
                <Text className="text-base">📋</Text>
                <Text className="flex-1 text-[15px] font-bold text-gray-900 dark:text-slate-100" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="text-[11px] text-gray-400 dark:text-slate-500">{formatDate(item.updatedAt)}</Text>
              </View>

              {item.description ? (
                <Text className="text-[13px] text-gray-500 dark:text-slate-400" numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}

              {subtasks.length > 0 && (
                <View className="gap-[3px]">
                  {subtasks.slice(0, 3).map((s, i) => (
                    <Text key={i} className="text-[12px] text-gray-400 dark:text-slate-500">
                      · {s.title}
                    </Text>
                  ))}
                  {subtasks.length > 3 && (
                    <Text className="text-[12px] text-gray-400 dark:text-slate-500">
                      +{subtasks.length - 3} more subtasks
                    </Text>
                  )}
                </View>
              )}

              <View className="flex-row gap-2">
                <View className="bg-blue-50 dark:bg-blue-900/30 rounded-[6px] px-2 py-[3px]">
                  <Text className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
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
