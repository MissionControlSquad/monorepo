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
  TASK_QUERY,
  UPDATE_TASK,
  PROFILES_QUERY,
  TASKS_QUERY,
  PROJECTS_QUERY,
} from "@agentcenter/graphql-client";
import { Avatar } from "../../src/components/Avatar";
import { useTheme } from "../../src/hooks/useTheme";

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
  const { colors } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const [taskResult] = useQuery<{ task: Task | null }>({
    query: TASK_QUERY,
    variables: { id },
    requestPolicy: "cache-first",
    pause: !mounted,
  });

  const task = taskResult.data?.task;

  // Form state — initialized from task once loaded
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

  if (taskResult.fetching && !task) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!task) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <Text style={{ color: colors.danger, fontSize: 16 }}>Task not found</Text>
      </View>
    );
  }

  const inputStyle = {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  };

  const labelStyle = { fontSize: 13, fontWeight: "600" as const, color: colors.textSecondary };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: insets.bottom + 40 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <View style={{ gap: 6 }}>
          <Text style={labelStyle}>Title *</Text>
          <TextInput
            style={inputStyle}
            placeholder="Task title…"
            placeholderTextColor={colors.placeholder}
            value={title}
            onChangeText={setTitle}
            returnKeyType="next"
          />
        </View>

        {/* Description */}
        <View style={{ gap: 6 }}>
          <Text style={labelStyle}>Description</Text>
          <TextInput
            style={[inputStyle, { minHeight: 100, textAlignVertical: "top", paddingTop: 12 }]}
            placeholder="Task description…"
            placeholderTextColor={colors.placeholder}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Priority */}
        <View style={{ gap: 6 }}>
          <Text style={labelStyle}>Priority</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <TouchableOpacity
              style={{
                borderWidth: 1,
                borderColor: priority === null ? colors.accent : colors.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: priority === null ? colors.accentSurface : colors.inputBg,
              }}
              onPress={() => setPriority(null)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 13, color: priority === null ? colors.accent : colors.textSecondary }}>None</Text>
            </TouchableOpacity>
            {PRIORITIES.map((p) => {
              const active = priority === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={{
                    borderWidth: 1,
                    borderColor: active ? PRIORITY_COLORS[p] : colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    backgroundColor: active ? PRIORITY_COLORS[p] + "18" : colors.inputBg,
                  }}
                  onPress={() => setPriority(p)}
                  activeOpacity={0.7}
                >
                  <Text style={{
                    fontSize: 13,
                    textTransform: "capitalize",
                    color: active ? PRIORITY_COLORS[p] : colors.textSecondary,
                    fontWeight: active ? "600" : "400",
                  }}>
                    {p}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Due Date */}
        <View style={{ gap: 6 }}>
          <Text style={labelStyle}>Due Date</Text>
          <TextInput
            style={inputStyle}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.placeholder}
            value={dueDate}
            onChangeText={setDueDate}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
          />
        </View>

        {/* Assignees */}
        <View style={{ gap: 6 }}>
          <Text style={labelStyle}>Assignees</Text>
          <TouchableOpacity
            style={[inputStyle, { minHeight: 44, justifyContent: "center" }]}
            onPress={() => setAssigneeModalOpen(true)}
            activeOpacity={0.7}
          >
            {selectedIds.length === 0 ? (
              <Text style={{ color: colors.placeholder, fontSize: 15 }}>Tap to assign…</Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {selectedIds.map((pid) => {
                  const p = profilesResult.data?.profiles.find((x) => x.id === pid);
                  return (
                    <View key={pid} style={{ backgroundColor: colors.accentSurface, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 13, color: colors.accent, fontWeight: "500" }}>
                        {p?.agent?.identityEmoji ?? ""} {p?.displayName ?? pid}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Tags */}
        <View style={{ gap: 6 }}>
          <Text style={labelStyle}>Tags</Text>
          {tags.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
              {tags.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={{ backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.border }}
                  onPress={() => setTags((prev) => prev.filter((t) => t !== tag))}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, color: colors.text }}>{tag} ✕</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TextInput
            style={inputStyle}
            placeholder="Type a tag and press space or comma…"
            placeholderTextColor={colors.placeholder}
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
        </View>

        {/* Project */}
        <View style={{ gap: 6 }}>
          <Text style={labelStyle}>Project</Text>
          <TouchableOpacity
            style={[inputStyle, { minHeight: 44, justifyContent: "center" }]}
            onPress={() => setProjectPickerOpen(true)}
            activeOpacity={0.7}
          >
            {projectId ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 15, color: colors.text }}>
                  {projectsResult.data?.projects.find((p) => p.id === projectId)?.name ?? "Loading..."}
                </Text>
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); setProjectId(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={{ color: colors.placeholder, fontSize: 15 }}>No project</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Parent Task */}
        <View style={{ gap: 6 }}>
          <Text style={labelStyle}>Parent Task</Text>
          <TouchableOpacity
            style={[inputStyle, { minHeight: 44, justifyContent: "center" }]}
            onPress={() => setParentTaskPickerOpen(true)}
            activeOpacity={0.7}
          >
            {parentTaskId ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 15, color: colors.text }}>
                  {(() => { const t = tasksResult.data?.tasks.find((x) => x.id === parentTaskId); return t ? `#${t.taskNumber} ${t.title}` : parentTaskId; })()}
                </Text>
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); setParentTaskId(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={{ color: colors.placeholder, fontSize: 15 }}>None (top-level task)</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Blocked By */}
        <View style={{ gap: 6 }}>
          <Text style={labelStyle}>Blocked By</Text>
          <TouchableOpacity
            style={[inputStyle, { minHeight: 44, justifyContent: "center" }]}
            onPress={() => setTaskPickerOpen(true)}
            activeOpacity={0.7}
          >
            {blockedByTaskId ? (
              (() => {
                const t = tasksResult.data?.tasks.find((x) => x.id === blockedByTaskId);
                return (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontSize: 15, color: colors.text }}>
                      {t ? `#${t.taskNumber} ${t.title}` : blockedByTaskId}
                    </Text>
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); setBlockedByTaskId(null); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={{ color: colors.textSecondary, fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })()
            ) : (
              <Text style={{ color: colors.placeholder, fontSize: 15 }}>Select blocking task…</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Save */}
        <TouchableOpacity
          style={{
            backgroundColor: (!title.trim() || saving) ? colors.accent + "80" : colors.accent,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: "center",
            marginTop: 4,
          }}
          onPress={handleSave}
          disabled={!title.trim() || saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>Save Changes</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={{ alignItems: "center", paddingVertical: 8 }} onPress={() => router.back()}>
          <Text style={{ fontSize: 15, color: colors.textSecondary }}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Assignee Picker Modal */}
      <Modal
        visible={assigneeModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAssigneeModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>Select Assignees</Text>
            <TouchableOpacity onPress={() => setAssigneeModalOpen(false)}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.accent }}>Done</Text>
            </TouchableOpacity>
          </View>
          {profilesResult.fetching ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={colors.accent} />
          ) : (
            <FlatList
              data={profilesResult.data?.profiles ?? []}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
              renderItem={({ item }) => {
                const selected = selectedIds.includes(item.id);
                return (
                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 12, backgroundColor: selected ? colors.accentSurface : colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}
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
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "500", color: colors.text }}>{item.displayName}</Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted }}>@{item.username}</Text>
                    </View>
                    {selected && <Text style={{ fontSize: 18, color: colors.accent, fontWeight: "700" }}>✓</Text>}
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
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>Select Project</Text>
            <TouchableOpacity onPress={() => setProjectPickerOpen(false)}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.accent }}>Done</Text>
            </TouchableOpacity>
          </View>
          {projectsResult.fetching ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={colors.accent} />
          ) : (
            <FlatList
              data={projectsResult.data?.projects ?? []}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
              ListHeaderComponent={
                <Pressable
                  style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 12, backgroundColor: projectId === null ? colors.accentSurface : colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}
                  onPress={() => { setProjectId(null); setProjectPickerOpen(false); }}
                >
                  <Text style={{ fontSize: 15, color: projectId === null ? colors.accent : colors.textSecondary, fontStyle: "italic" }}>No project</Text>
                  {projectId === null && <Text style={{ fontSize: 18, color: colors.accent, fontWeight: "700", marginLeft: "auto" }}>✓</Text>}
                </Pressable>
              }
              renderItem={({ item }) => {
                const selected = projectId === item.id;
                return (
                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 12, backgroundColor: selected ? colors.accentSurface : colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}
                    onPress={() => { setProjectId(item.id); setProjectPickerOpen(false); }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: "500", color: colors.text, flex: 1 }}>{item.name}</Text>
                    {selected && <Text style={{ fontSize: 18, color: colors.accent, fontWeight: "700" }}>✓</Text>}
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
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>Select Parent Task</Text>
            <TouchableOpacity onPress={() => setParentTaskPickerOpen(false)}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.accent }}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TextInput
              style={inputStyle}
              placeholder="Search tasks…"
              placeholderTextColor={colors.placeholder}
              value={taskPickerSearch}
              onChangeText={setTaskPickerSearch}
              autoFocus
            />
          </View>
          {tasksResult.fetching ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={colors.accent} />
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
                  style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 12, backgroundColor: parentTaskId === null ? colors.accentSurface : colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}
                  onPress={() => { setParentTaskId(null); setParentTaskPickerOpen(false); }}
                >
                  <Text style={{ fontSize: 15, color: parentTaskId === null ? colors.accent : colors.textSecondary, fontStyle: "italic" }}>None (top-level task)</Text>
                  {parentTaskId === null && <Text style={{ fontSize: 18, color: colors.accent, fontWeight: "700", marginLeft: "auto" }}>✓</Text>}
                </Pressable>
              }
              renderItem={({ item }) => {
                const selected = parentTaskId === item.id;
                return (
                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 12, backgroundColor: selected ? colors.accentSurface : colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}
                    onPress={() => { setParentTaskId(item.id); setParentTaskPickerOpen(false); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "500", color: colors.text }}>#{item.taskNumber} {item.title}</Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted }}>{item.status.replace("_", " ")}</Text>
                    </View>
                    {selected && <Text style={{ fontSize: 18, color: colors.accent, fontWeight: "700" }}>✓</Text>}
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
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>Blocked By Task</Text>
            <TouchableOpacity onPress={() => setTaskPickerOpen(false)}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.accent }}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TextInput
              style={inputStyle}
              placeholder="Search tasks…"
              placeholderTextColor={colors.placeholder}
              value={taskPickerSearch}
              onChangeText={setTaskPickerSearch}
              autoFocus
            />
          </View>
          {tasksResult.fetching ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={colors.accent} />
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
                    style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 12, backgroundColor: selected ? colors.accentSurface : colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}
                    onPress={() => {
                      setBlockedByTaskId(selected ? null : item.id);
                      setTaskPickerOpen(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "500", color: colors.text }}>#{item.taskNumber} {item.title}</Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted }}>{item.status.replace("_", " ")}</Text>
                    </View>
                    {selected && <Text style={{ fontSize: 18, color: colors.accent, fontWeight: "700" }}>✓</Text>}
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
