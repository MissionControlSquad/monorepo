import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
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
import { CREATE_TASK_FROM_DASHBOARD, PROFILES_QUERY, TASKS_QUERY, TASK_TEMPLATES_QUERY, INSTANTIATE_TEMPLATE } from "@agentcenter/graphql-client";
import { Avatar } from "../../src/components/Avatar";
import { PRIORITY_HEX_COLORS, PRIORITY_VALUES } from "@agentcenter/utils";
import type { Priority } from "@agentcenter/types";

const PRIORITIES = PRIORITY_VALUES;

interface Profile {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  agent: { identityEmoji: string | null } | null;
}

interface TaskOption {
  id: string;
  taskNumber: number;
  title: string;
  status: string;
}

interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;
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
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [blockedByTaskId, setBlockedByTaskId] = useState<string | null>(null);
  const [parentTaskId, setParentTaskId] = useState<string | null>(null);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [parentTaskPickerOpen, setParentTaskPickerOpen] = useState(false);
  const [taskPickerSearch, setTaskPickerSearch] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  const [profilesResult] = useQuery<{ profiles: Profile[] }>({
    query: PROFILES_QUERY,
    variables: { limit: 100 },
    pause: !assigneeModalOpen,
  });

  const [tasksResult] = useQuery<{ tasks: TaskOption[] }>({
    query: TASKS_QUERY,
    variables: { limit: 200 },
    pause: !taskPickerOpen && !parentTaskPickerOpen,
  });

  const [templatesResult] = useQuery<{ taskTemplates: TaskTemplate[] }>({
    query: TASK_TEMPLATES_QUERY,
    pause: !templatePickerOpen,
  });

  const [, createTask] = useMutation(CREATE_TASK_FROM_DASHBOARD);
  const [{ fetching: instantiating }, instantiateTemplate] = useMutation(INSTANTIATE_TEMPLATE);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert("Missing title", "Please enter a task title.");
      return;
    }
    setLoading(true);
    const finalTags = tagInput.trim()
      ? [...tags, tagInput.trim()]
      : tags;

    const res = await createTask({
      title: title.trim(),
      description: description.trim(),
      priority: priority ?? undefined,
      assigneeIds: selectedIds,
      tags: finalTags.length > 0 ? finalTags : undefined,
      projectId: projectId ?? undefined,
      parentTaskId: parentTaskId ?? undefined,
      blockedByTaskId: blockedByTaskId ?? undefined,
      dueDate: dueDate.trim() ? new Date(dueDate.trim()).toISOString() : undefined,
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
      className="flex-1 bg-gray-50 dark:bg-slate-900"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: insets.bottom + 20 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {/* Template picker */}
        <TouchableOpacity
          className="flex-row items-center justify-center border border-gray-200 dark:border-slate-600 rounded-xl py-2.5 bg-white dark:bg-slate-800"
          onPress={() => setTemplatePickerOpen(true)}
          activeOpacity={0.7}
        >
          <Text className="text-sm text-gray-700 dark:text-slate-300 font-medium">📋 Use Template</Text>
        </TouchableOpacity>

        {/* Template picker modal */}
        <Modal
          visible={templatePickerOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setTemplatePickerOpen(false)}
        >
          <View className="flex-1 bg-gray-50 dark:bg-slate-900">
            <View className="flex-row justify-between items-center p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <Text className="text-lg font-semibold text-gray-900 dark:text-slate-100">Task Templates</Text>
              <TouchableOpacity onPress={() => setTemplatePickerOpen(false)}>
                <Text className="text-base font-semibold text-blue-600 dark:text-blue-400">Close</Text>
              </TouchableOpacity>
            </View>
            {templatesResult.fetching ? (
              <ActivityIndicator style={{ marginTop: 32 }} color="#2563eb" />
            ) : (templatesResult.data?.taskTemplates ?? []).length === 0 ? (
              <View className="flex-1 justify-center items-center gap-2">
                <Text className="text-base text-gray-400 dark:text-slate-500">No templates available</Text>
              </View>
            ) : (
              <FlatList
                data={templatesResult.data?.taskTemplates ?? []}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                renderItem={({ item }) => (
                  <View className="flex-row items-center p-3.5 gap-3 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700">
                    <View className="flex-1">
                      <Text className="text-base font-medium text-gray-900 dark:text-slate-100">{item.name}</Text>
                      {item.description ? (
                        <Text className="text-xs text-gray-400 dark:text-slate-500 mt-px" numberOfLines={2}>
                          {item.description}
                        </Text>
                      ) : null}
                    </View>
                    <View className="flex-row gap-2">
                      <TouchableOpacity
                        onPress={() => {
                          setTitle(item.name);
                          if (item.description) setDescription(item.description);
                          setTemplatePickerOpen(false);
                        }}
                        className="px-2 py-1 rounded-md border border-blue-200 dark:border-blue-700"
                      >
                        <Text className="text-blue-600 dark:text-blue-400 text-xs font-semibold">Pre-fill</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={instantiating}
                        onPress={async () => {
                          const res = await instantiateTemplate({
                            templateId: item.id,
                            projectId: projectId ?? undefined,
                          });
                          if (res.error) {
                            Alert.alert("Error", "Failed to create from template");
                            return;
                          }
                          const raw = res.data?.instantiateTemplate;
                          const result = typeof raw === "string" ? JSON.parse(raw) : raw;
                          const parentId = result?.parentTaskId;
                          setTemplatePickerOpen(false);
                          if (parentId) {
                            router.replace(`/task/${parentId}` as Parameters<typeof router.replace>[0]);
                          } else {
                            router.back();
                          }
                        }}
                        className="px-2 py-1 rounded-md bg-blue-600"
                      >
                        {instantiating ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text className="text-white text-xs font-semibold">Create</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
            )}
          </View>
        </Modal>

        {/* Title */}
        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Title *</Text>
          <TextInput
            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
            placeholder="What needs to be done?"
            placeholderTextColor="#9ca3af"
            value={title}
            onChangeText={setTitle}
            autoFocus
            returnKeyType="next"
          />
        </View>

        {/* Description */}
        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Description</Text>
          <TextInput
            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
            style={{ minHeight: 100 }}
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
        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Priority</Text>
          <View className="flex-row flex-wrap gap-2">
            <TouchableOpacity
              className={`border rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 ${priority === null ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border-gray-200 dark:border-slate-600"}`}
              onPress={() => setPriority(null)}
              activeOpacity={0.7}
            >
              <Text className={`text-sm ${priority === null ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-slate-400"}`}>
                None
              </Text>
            </TouchableOpacity>
            {PRIORITIES.map((p) => (
              <TouchableOpacity
                key={p}
                className="border rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800"
                style={priority === p ? {
                  backgroundColor: PRIORITY_HEX_COLORS[p] + "18",
                  borderColor: PRIORITY_HEX_COLORS[p],
                } : { borderColor: "#e5e7eb" }}
                onPress={() => setPriority(p)}
                activeOpacity={0.7}
              >
                <Text
                  className="text-sm capitalize"
                  style={priority === p ? { color: PRIORITY_HEX_COLORS[p], fontWeight: "600" } : { color: "#6b7280" }}
                >
                  {p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Due Date */}
        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Due Date</Text>
          <TextInput
            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9ca3af"
            value={dueDate}
            onChangeText={setDueDate}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
          />
        </View>

        {/* Assignees */}
        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Assignees</Text>
          <TouchableOpacity
            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 min-h-11 justify-center"
            onPress={() => setAssigneeModalOpen(true)}
            activeOpacity={0.7}
          >
            {selectedIds.length === 0 ? (
              <Text className="text-gray-400 dark:text-slate-500 text-base">Tap to assign…</Text>
            ) : (
              <View className="flex-row flex-wrap gap-1.5">
                {selectedIds.map((id) => {
                  const p = profilesResult.data?.profiles.find((x) => x.id === id);
                  return (
                    <View key={id} className="bg-blue-100 dark:bg-blue-900/30 rounded-full px-2.5 py-1">
                      <Text className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                        {p?.agent?.identityEmoji ?? ""} {p?.displayName ?? id}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Tags */}
        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Tags</Text>
          {tags.length > 0 && (
            <View className="flex-row flex-wrap gap-1.5">
              {tags.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  className="bg-gray-100 dark:bg-slate-700 rounded-full px-2.5 py-1 border border-gray-200 dark:border-slate-600"
                  onPress={() => setTags((prev) => prev.filter((t) => t !== tag))}
                  activeOpacity={0.7}
                >
                  <Text className="text-sm text-gray-700 dark:text-slate-300 font-medium">{tag} ✕</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TextInput
            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
            placeholder="Type a tag and press space or comma…"
            placeholderTextColor="#9ca3af"
            value={tagInput}
            onChangeText={(text) => {
              if (text.endsWith(" ") || text.endsWith(",")) {
                const tag = text.replace(/[, ]+$/, "").trim();
                if (tag && !tags.includes(tag)) {
                  setTags((prev) => [...prev, tag]);
                }
                setTagInput("");
              } else {
                setTagInput(text);
              }
            }}
            onSubmitEditing={() => {
              const tag = tagInput.trim();
              if (tag && !tags.includes(tag)) {
                setTags((prev) => [...prev, tag]);
              }
              setTagInput("");
            }}
            returnKeyType="done"
            blurOnSubmit={false}
          />
        </View>

        {/* Parent Task */}
        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Parent Task</Text>
          <TouchableOpacity
            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 min-h-11 justify-center"
            onPress={() => setParentTaskPickerOpen(true)}
            activeOpacity={0.7}
          >
            {parentTaskId ? (
              (() => {
                const t = tasksResult.data?.tasks.find((x) => x.id === parentTaskId);
                return (
                  <View className="flex-row justify-between items-center">
                    <Text className="text-base text-gray-900 dark:text-slate-100">
                      {t ? `#${t.taskNumber} ${t.title}` : parentTaskId}
                    </Text>
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); setParentTaskId(null); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text className="text-gray-500 dark:text-slate-400 text-base">✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })()
            ) : (
              <Text className="text-gray-400 dark:text-slate-500 text-base">None (top-level task)</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Blocked By */}
        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Blocked By</Text>
          <TouchableOpacity
            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 min-h-11 justify-center"
            onPress={() => setTaskPickerOpen(true)}
            activeOpacity={0.7}
          >
            {blockedByTaskId ? (
              (() => {
                const t = tasksResult.data?.tasks.find((x) => x.id === blockedByTaskId);
                return (
                  <View className="flex-row justify-between items-center">
                    <Text className="text-base text-gray-900 dark:text-slate-100">
                      {t ? `#${t.taskNumber} ${t.title}` : blockedByTaskId}
                    </Text>
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); setBlockedByTaskId(null); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text className="text-gray-500 dark:text-slate-400 text-base">✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })()
            ) : (
              <Text className="text-gray-400 dark:text-slate-500 text-base">Select blocking task…</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Task picker modal (blocked-by) */}
        <Modal
          visible={taskPickerOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setTaskPickerOpen(false)}
        >
          <View className="flex-1 bg-gray-50 dark:bg-slate-900">
            <View className="flex-row justify-between items-center p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <Text className="text-lg font-semibold text-gray-900 dark:text-slate-100">Blocked By Task</Text>
              <TouchableOpacity onPress={() => setTaskPickerOpen(false)}>
                <Text className="text-base font-semibold text-blue-600 dark:text-blue-400">Done</Text>
              </TouchableOpacity>
            </View>
            <View className="px-3.5 py-2.5 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <TextInput
                className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base text-gray-900 dark:text-slate-100"
                placeholder="Search tasks…"
                placeholderTextColor="#9ca3af"
                value={taskPickerSearch}
                onChangeText={setTaskPickerSearch}
                autoFocus
              />
            </View>
            {tasksResult.fetching ? (
              <ActivityIndicator style={{ marginTop: 32 }} color="#2563eb" />
            ) : (
              <FlatList
                data={(tasksResult.data?.tasks ?? []).filter((t) =>
                  taskPickerSearch.trim() === "" ||
                  t.title.toLowerCase().includes(taskPickerSearch.toLowerCase()) ||
                  String(t.taskNumber).includes(taskPickerSearch)
                )}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                renderItem={({ item }) => {
                  const selected = blockedByTaskId === item.id;
                  return (
                    <Pressable
                      className={`flex-row items-center p-3.5 gap-3 border-b border-gray-100 dark:border-slate-700 ${selected ? "bg-blue-50 dark:bg-blue-900/20" : "bg-white dark:bg-slate-800"}`}
                      onPress={() => {
                        setBlockedByTaskId(selected ? null : item.id);
                        setTaskPickerOpen(false);
                      }}
                    >
                      <View className="flex-1">
                        <Text className="text-base font-medium text-gray-900 dark:text-slate-100">
                          #{item.taskNumber} {item.title}
                        </Text>
                        <Text className="text-xs text-gray-400 dark:text-slate-500 mt-px">{item.status.replace("_", " ")}</Text>
                      </View>
                      {selected && <Text className="text-lg text-blue-600 dark:text-blue-400 font-bold">✓</Text>}
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </Modal>

        {/* Parent Task picker modal */}
        <Modal
          visible={parentTaskPickerOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setParentTaskPickerOpen(false)}
        >
          <View className="flex-1 bg-gray-50 dark:bg-slate-900">
            <View className="flex-row justify-between items-center p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <Text className="text-lg font-semibold text-gray-900 dark:text-slate-100">Select Parent Task</Text>
              <TouchableOpacity onPress={() => setParentTaskPickerOpen(false)}>
                <Text className="text-base font-semibold text-blue-600 dark:text-blue-400">Done</Text>
              </TouchableOpacity>
            </View>
            <View className="px-3.5 py-2.5 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <TextInput
                className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-base text-gray-900 dark:text-slate-100"
                placeholder="Search tasks…"
                placeholderTextColor="#9ca3af"
                value={taskPickerSearch}
                onChangeText={setTaskPickerSearch}
                autoFocus
              />
            </View>
            {tasksResult.fetching ? (
              <ActivityIndicator style={{ marginTop: 32 }} color="#2563eb" />
            ) : (
              <FlatList
                data={(tasksResult.data?.tasks ?? []).filter((t) =>
                  taskPickerSearch.trim() === "" ||
                  t.title.toLowerCase().includes(taskPickerSearch.toLowerCase()) ||
                  String(t.taskNumber).includes(taskPickerSearch)
                )}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                ListHeaderComponent={
                  <Pressable
                    className={`flex-row items-center p-3.5 border-b border-gray-100 dark:border-slate-700 ${parentTaskId === null ? "bg-blue-50 dark:bg-blue-900/20" : "bg-white dark:bg-slate-800"}`}
                    onPress={() => { setParentTaskId(null); setParentTaskPickerOpen(false); }}
                  >
                    <Text className="text-base font-medium italic text-gray-500 dark:text-slate-400">
                      None (top-level task)
                    </Text>
                    {parentTaskId === null && <Text className="text-lg text-blue-600 dark:text-blue-400 font-bold ml-auto">✓</Text>}
                  </Pressable>
                }
                renderItem={({ item }) => {
                  const selected = parentTaskId === item.id;
                  return (
                    <Pressable
                      className={`flex-row items-center p-3.5 gap-3 border-b border-gray-100 dark:border-slate-700 ${selected ? "bg-blue-50 dark:bg-blue-900/20" : "bg-white dark:bg-slate-800"}`}
                      onPress={() => {
                        setParentTaskId(item.id);
                        setParentTaskPickerOpen(false);
                      }}
                    >
                      <View className="flex-1">
                        <Text className="text-base font-medium text-gray-900 dark:text-slate-100">
                          #{item.taskNumber} {item.title}
                        </Text>
                        <Text className="text-xs text-gray-400 dark:text-slate-500 mt-px">{item.status.replace("_", " ")}</Text>
                      </View>
                      {selected && <Text className="text-lg text-blue-600 dark:text-blue-400 font-bold">✓</Text>}
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </Modal>

        {/* Assignee picker modal */}
        <Modal
          visible={assigneeModalOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setAssigneeModalOpen(false)}
        >
          <View className="flex-1 bg-gray-50 dark:bg-slate-900">
            <View className="flex-row justify-between items-center p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <Text className="text-lg font-semibold text-gray-900 dark:text-slate-100">Select Assignees</Text>
              <TouchableOpacity onPress={() => setAssigneeModalOpen(false)}>
                <Text className="text-base font-semibold text-blue-600 dark:text-blue-400">Done</Text>
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
                      className={`flex-row items-center p-3.5 gap-3 border-b border-gray-100 dark:border-slate-700 ${selected ? "bg-blue-50 dark:bg-blue-900/20" : "bg-white dark:bg-slate-800"}`}
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
                      <View className="flex-1">
                        <Text className="text-base font-medium text-gray-900 dark:text-slate-100">{item.displayName}</Text>
                        <Text className="text-xs text-gray-400 dark:text-slate-500 mt-px">@{item.username}</Text>
                      </View>
                      {selected && <Text className="text-lg text-blue-600 dark:text-blue-400 font-bold">✓</Text>}
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </Modal>

        {/* Submit */}
        <TouchableOpacity
          className={`bg-blue-600 rounded-xl py-3.5 items-center mt-1 ${(!title.trim() || loading) ? "opacity-50" : ""}`}
          onPress={handleCreate}
          disabled={!title.trim() || loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white text-base font-semibold">Create Task</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity className="items-center py-2" onPress={() => router.back()}>
          <Text className="text-base text-gray-500 dark:text-slate-400">Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
