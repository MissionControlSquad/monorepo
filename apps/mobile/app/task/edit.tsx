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
import { useState, useEffect } from "react";
import { useRouter, useLocalSearchParams, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery } from "urql";
import {
  TASK_EDIT_QUERY,
  UPDATE_TASK,
  PROFILES_QUERY,
  TASKS_QUERY,
  PROJECTS_QUERY,
} from "@agentcenter/graphql-client";
import { Avatar } from "../../src/components/Avatar";
import { PRIORITY_HEX_COLORS, PRIORITY_VALUES } from "@agentcenter/utils";
import type { Priority } from "@agentcenter/types";
import { FormField } from "../../src/components/FormField";
import { ModalSheetHeader } from "../../src/components/ModalSheetHeader";
import { ActionButton } from "../../src/components/ActionButton";
import { ScreenLoading } from "../../src/components/ScreenLoading";

const PRIORITIES = PRIORITY_VALUES;

interface Profile {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  agent: { identityEmoji: string | null } | null;
}

interface TaskAssignee {
  id: string;
  profileId: string;
  profile: Profile;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  taskNumber: number;
  dueDate: string | null;
  tags: string[];
  parentTaskId: string | null;
  blockedByTaskId: string | null;
  projectId: string | null;
  assignees: TaskAssignee[];
}

interface TaskOption {
  id: string;
  taskNumber: number;
  title: string;
  status: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

export default function EditTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [taskResult] = useQuery<{ task: Task | null }>({
    query: TASK_EDIT_QUERY,
    variables: { id },
    requestPolicy: "network-only",
  });

  const task = taskResult.data?.task;

  const [initialized, setInitialized] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [blockedByTaskId, setBlockedByTaskId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [parentTaskId, setParentTaskId] = useState<string | null>(null);

  const [assigneeModalOpen, setAssigneeModalOpen] = useState(false);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [taskPickerSearch, setTaskPickerSearch] = useState("");
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [parentTaskPickerOpen, setParentTaskPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const [projectsResult] = useQuery<{ projects: ProjectOption[] }>({
    query: PROJECTS_QUERY,
    pause: !projectPickerOpen,
    requestPolicy: "cache-and-network",
  });

  const [, updateTask] = useMutation(UPDATE_TASK);

  useEffect(() => {
    if (task && !initialized) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setPriority((task.priority as Priority) ?? null);
      setDueDate(task.dueDate ? task.dueDate.slice(0, 10) : "");
      setTags(task.tags ?? []);
      setSelectedIds(task.assignees.map((a) => a.profileId));
      setBlockedByTaskId(task.blockedByTaskId ?? null);
      setProjectId(task.projectId ?? null);
      setParentTaskId(task.parentTaskId ?? null);
      setInitialized(true);
    }
  }, [task, initialized]);

  useEffect(() => {
    if (task) navigation.setOptions({ title: `Edit #${task.taskNumber}` });
  }, [task, navigation]);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Missing title", "Task title is required.");
      return;
    }
    setSaving(true);
    const finalTags = tagInput.trim() ? [...tags, tagInput.trim()] : tags;
    const res = await updateTask({
      id,
      title: title.trim(),
      description: description.trim(),
      priority: priority ?? undefined,
      assigneeIds: selectedIds,
      tags: finalTags.length > 0 ? finalTags : [],
      blockedByTaskId: blockedByTaskId ?? undefined,
      projectId: projectId ?? undefined,
      parentTaskId: parentTaskId ?? undefined,
      dueDate: dueDate.trim() ? new Date(dueDate.trim()).toISOString() : undefined,
    });
    setSaving(false);
    if (res.error) {
      Alert.alert("Error", res.error.message || "Failed to save");
    } else {
      router.back();
    }
  };

  if (taskResult.fetching && !task) return <ScreenLoading />;

  if (!task) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900">
        <Text className="text-base text-red-600 dark:text-red-400">Task not found</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50 dark:bg-slate-900"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: insets.bottom + 40 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <FormField label="Title" required>
          <TextInput
            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
            placeholder="Task title…"
            placeholderTextColor="#9ca3af"
            value={title}
            onChangeText={setTitle}
            returnKeyType="next"
          />
        </FormField>

        {/* Description */}
        <FormField label="Description">
          <TextInput
            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
            style={{ minHeight: 100, textAlignVertical: "top" }}
            placeholder="Task description…"
            placeholderTextColor="#9ca3af"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />
        </FormField>

        {/* Priority */}
        <FormField label="Priority">
          <View className="flex-row flex-wrap gap-2">
            <TouchableOpacity
              className={`border rounded-lg px-3 py-1.5 ${priority === null ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800"}`}
              onPress={() => setPriority(null)}
              activeOpacity={0.7}
            >
              <Text className={`text-sm ${priority === null ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-slate-400"}`}>None</Text>
            </TouchableOpacity>
            {PRIORITIES.map((p) => {
              const active = priority === p;
              return (
                <TouchableOpacity
                  key={p}
                  className="border rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800"
                  style={active ? {
                    borderColor: PRIORITY_HEX_COLORS[p],
                    backgroundColor: PRIORITY_HEX_COLORS[p] + "18",
                  } : { borderColor: "#e5e7eb" }}
                  onPress={() => setPriority(p)}
                  activeOpacity={0.7}
                >
                  <Text
                    className="text-sm capitalize"
                    style={active ? { color: PRIORITY_HEX_COLORS[p], fontWeight: "600" } : { color: "#6b7280" }}
                  >
                    {p}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </FormField>

        {/* Due Date */}
        <FormField label="Due Date">
          <TextInput
            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9ca3af"
            value={dueDate}
            onChangeText={setDueDate}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
          />
        </FormField>

        {/* Assignees */}
        <FormField label="Assignees">
          <TouchableOpacity
            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 min-h-11 justify-center"
            onPress={() => setAssigneeModalOpen(true)}
            activeOpacity={0.7}
          >
            {selectedIds.length === 0 ? (
              <Text className="text-gray-400 dark:text-slate-500 text-base">Tap to assign…</Text>
            ) : (
              <View className="flex-row flex-wrap gap-1.5">
                {selectedIds.map((pid) => {
                  const p = profilesResult.data?.profiles.find((x) => x.id === pid);
                  return (
                    <View key={pid} className="bg-blue-100 dark:bg-blue-900/30 rounded-full px-2.5 py-1">
                      <Text className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                        {p?.agent?.identityEmoji ?? ""} {p?.displayName ?? pid}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </TouchableOpacity>
        </FormField>

        {/* Tags */}
        <FormField label="Tags">
          {tags.length > 0 && (
            <View className="flex-row flex-wrap gap-1.5 mb-1.5">
              {tags.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  className="bg-white dark:bg-slate-800 rounded-full px-2.5 py-1 border border-gray-200 dark:border-slate-600"
                  onPress={() => setTags((prev) => prev.filter((t) => t !== tag))}
                  activeOpacity={0.7}
                >
                  <Text className="text-sm text-gray-900 dark:text-slate-100">{tag} ✕</Text>
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
                if (tag && !tags.includes(tag)) setTags((prev) => [...prev, tag]);
                setTagInput("");
              } else {
                setTagInput(text);
              }
            }}
            onSubmitEditing={() => {
              const tag = tagInput.trim();
              if (tag && !tags.includes(tag)) setTags((prev) => [...prev, tag]);
              setTagInput("");
            }}
            returnKeyType="done"
            blurOnSubmit={false}
          />
        </FormField>

        {/* Project */}
        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Project</Text>
          <TouchableOpacity
            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 min-h-11 justify-center"
            onPress={() => setProjectPickerOpen(true)}
            activeOpacity={0.7}
          >
            {projectId ? (
              <View className="flex-row justify-between items-center">
                <Text className="text-base text-gray-900 dark:text-slate-100">
  {projectsResult.data?.projects.find((p) => p.id === projectId)?.name ?? "Loading..."}
                </Text>
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); setProjectId(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text className="text-gray-500 dark:text-slate-400 text-base">✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text className="text-gray-400 dark:text-slate-500 text-base">No project</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Parent Task */}
        <FormField label="Parent Task">
          <TouchableOpacity
            className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 min-h-11 justify-center"
            onPress={() => setParentTaskPickerOpen(true)}
            activeOpacity={0.7}
          >
            {parentTaskId ? (
              <View className="flex-row justify-between items-center">
                <Text className="text-base text-gray-900 dark:text-slate-100">
  {(() => { const t = tasksResult.data?.tasks.find((x) => x.id === parentTaskId); return t ? `#${t.taskNumber} ${t.title}` : parentTaskId; })()}
                </Text>
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); setParentTaskId(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text className="text-gray-500 dark:text-slate-400 text-base">✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text className="text-gray-400 dark:text-slate-500 text-base">None (top-level task)</Text>
            )}
          </TouchableOpacity>
        </FormField>

        {/* Blocked By */}
        <FormField label="Blocked By">
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
        </FormField>

        {/* Save */}
        <ActionButton label="Save Changes" onPress={handleSave} loading={saving} disabled={!title.trim()} />

        <TouchableOpacity className="items-center py-2" onPress={() => router.back()}>
          <Text className="text-base text-gray-500 dark:text-slate-400">Cancel</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Assignee Picker Modal */}
      <Modal
        visible={assigneeModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAssigneeModalOpen(false)}
      >
        <View className="flex-1 bg-gray-50 dark:bg-slate-900">
          <ModalSheetHeader title="Select Assignees" onClose={() => setAssigneeModalOpen(false)} />
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
                        selected ? prev.filter((pid) => pid !== item.id) : [...prev, item.id]
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

      {/* Project Picker Modal */}
      <Modal
        visible={projectPickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setProjectPickerOpen(false)}
      >
        <View className="flex-1 bg-gray-50 dark:bg-slate-900">
          <ModalSheetHeader title="Select Project" onClose={() => setProjectPickerOpen(false)} />
          {projectsResult.fetching ? (
            <ActivityIndicator style={{ marginTop: 32 }} color="#2563eb" />
          ) : (
            <FlatList
              data={projectsResult.data?.projects ?? []}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
              ListHeaderComponent={
                <Pressable
                  className={`flex-row items-center p-3.5 gap-3 border-b border-gray-100 dark:border-slate-700 ${projectId === null ? "bg-blue-50 dark:bg-blue-900/20" : "bg-white dark:bg-slate-800"}`}
                  onPress={() => { setProjectId(null); setProjectPickerOpen(false); }}
                >
                  <Text className={`text-base italic ${projectId === null ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-slate-400"}`}>No project</Text>
                  {projectId === null && <Text className="text-lg text-blue-600 dark:text-blue-400 font-bold ml-auto">✓</Text>}
                </Pressable>
              }
              renderItem={({ item }) => {
                const selected = projectId === item.id;
                return (
                  <Pressable
                    className={`flex-row items-center p-3.5 gap-3 border-b border-gray-100 dark:border-slate-700 ${selected ? "bg-blue-50 dark:bg-blue-900/20" : "bg-white dark:bg-slate-800"}`}
                    onPress={() => { setProjectId(item.id); setProjectPickerOpen(false); }}
                  >
                    <Text className="text-base font-medium text-gray-900 dark:text-slate-100 flex-1">{item.name}</Text>
                    {selected && <Text className="text-lg text-blue-600 dark:text-blue-400 font-bold">✓</Text>}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </Modal>

      {/* Parent Task Picker Modal */}
      <Modal
        visible={parentTaskPickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setParentTaskPickerOpen(false)}
      >
        <View className="flex-1 bg-gray-50 dark:bg-slate-900">
          <ModalSheetHeader title="Select Parent Task" onClose={() => setParentTaskPickerOpen(false)} />
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
              data={(tasksResult.data?.tasks ?? []).filter(
                (t) =>
                  t.id !== id &&
                  (taskPickerSearch.trim() === "" ||
                    t.title.toLowerCase().includes(taskPickerSearch.toLowerCase()) ||
                    String(t.taskNumber).includes(taskPickerSearch))
              )}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
              ListHeaderComponent={
                <Pressable
                  className={`flex-row items-center p-3.5 gap-3 border-b border-gray-100 dark:border-slate-700 ${parentTaskId === null ? "bg-blue-50 dark:bg-blue-900/20" : "bg-white dark:bg-slate-800"}`}
                  onPress={() => { setParentTaskId(null); setParentTaskPickerOpen(false); }}
                >
                  <Text className={`text-base italic ${parentTaskId === null ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-slate-400"}`}>None (top-level task)</Text>
                  {parentTaskId === null && <Text className="text-lg text-blue-600 dark:text-blue-400 font-bold ml-auto">✓</Text>}
                </Pressable>
              }
              renderItem={({ item }) => {
                const selected = parentTaskId === item.id;
                return (
                  <Pressable
                    className={`flex-row items-center p-3.5 gap-3 border-b border-gray-100 dark:border-slate-700 ${selected ? "bg-blue-50 dark:bg-blue-900/20" : "bg-white dark:bg-slate-800"}`}
                    onPress={() => { setParentTaskId(item.id); setParentTaskPickerOpen(false); }}
                  >
                    <View className="flex-1">
                      <Text className="text-base font-medium text-gray-900 dark:text-slate-100">#{item.taskNumber} {item.title}</Text>
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

      {/* Blocked-By Task Picker Modal */}
      <Modal
        visible={taskPickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTaskPickerOpen(false)}
      >
        <View className="flex-1 bg-gray-50 dark:bg-slate-900">
          <ModalSheetHeader title="Blocked By Task" onClose={() => setTaskPickerOpen(false)} />
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
              data={(tasksResult.data?.tasks ?? []).filter(
                (t) =>
                  t.id !== id &&
                  (taskPickerSearch.trim() === "" ||
                    t.title.toLowerCase().includes(taskPickerSearch.toLowerCase()) ||
                    String(t.taskNumber).includes(taskPickerSearch))
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
                      <Text className="text-base font-medium text-gray-900 dark:text-slate-100">#{item.taskNumber} {item.title}</Text>
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
    </KeyboardAvoidingView>
  );
}
