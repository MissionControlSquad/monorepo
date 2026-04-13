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
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "urql";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  RECURRING_TASKS_QUERY,
  CREATE_RECURRING_TASK,
  UPDATE_RECURRING_TASK,
  PAUSE_RECURRING_TASK,
  RESUME_RECURRING_TASK,
  TRIGGER_RECURRING_TASK,
  DELETE_RECURRING_TASK,
  PROJECTS_QUERY,
  PROFILES_QUERY,
} from "@agentcenter/graphql-client";
import { formatDate, PRIORITY_VALUES, RecurringFrequency } from "@agentcenter/utils";
import { EmptyState } from "../src/components/EmptyState";
import { FormField } from "../src/components/FormField";
import { StatusPill } from "../src/components/StatusPill";
import { PriorityBadge } from "../src/components/PriorityBadge";
import { FilterChip } from "../src/components/FilterChip";
import { useAuth } from "../src/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import { SearchBar } from "../src/components/SearchBar";
import { ScreenLoading } from "../src/components/ScreenLoading";

interface RecurringTask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string | null;
  tags: string[];
  recurrenceConfig: unknown;
  isActive: boolean;
  timezone: string | null;
  nextDueAt: string | null;
  lastGeneratedAt: string | null;
  projectId: string | null;
}

const FREQUENCIES = [
  { label: "Daily", value: '{"frequency":"daily"}' },
  { label: "Weekdays", value: '{"frequency":"weekly","daysOfWeek":[1,2,3,4,5]}' },
  { label: "Weekly (Mon)", value: '{"frequency":"weekly","daysOfWeek":[1]}' },
  { label: "Bi-weekly", value: '{"frequency":"weekly","interval":2,"daysOfWeek":[1]}' },
  { label: "Monthly (1st)", value: '{"frequency":"monthly","dayOfMonth":1}' },
] as const;

const PRIORITIES = PRIORITY_VALUES;

function parseFreqLabel(config: unknown): string {
  try {
    const c = (typeof config === "string" ? JSON.parse(config) : config) as {
      frequency?: string; interval?: number; daysOfWeek?: number[]; dayOfMonth?: number;
      time?: string; type?: string;
    };
    if (c.frequency === RecurringFrequency.DAILY) return "Daily";
    if (c.frequency === RecurringFrequency.WEEKLY) {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayNames = (c.daysOfWeek ?? []).map((d) => days[d]).join(", ");
      return c.interval ? `Every ${c.interval}w · ${dayNames}` : `Weekly · ${dayNames}`;
    }
    if (c.frequency === RecurringFrequency.MONTHLY) return `Monthly · day ${c.dayOfMonth ?? 1}`;
    if (c.type) return String(c.type);
    return typeof config === "string" ? config : JSON.stringify(config);
  } catch {
    return typeof config === "string" ? config : "—";
  }
}

function freqIndexFromConfig(config: unknown): number {
  try {
    const str = typeof config === "string" ? config : JSON.stringify(config);
    const idx = FREQUENCIES.findIndex((f) => f.value === str);
    return idx >= 0 ? idx : 0;
  } catch {
    return 0;
  }
}

// ── Shared Form Modal ──────────────────────────────────────────────────────────

function RecurringTaskFormModal({
  visible,
  onClose,
  onSave,
  initialValues,
  title: modalTitle,
  saveLabel,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (values: {
    title: string;
    description: string;
    recurrenceConfig: string;
    priority: string | null;
    tags: string[];
    projectId: string | null;
    assigneeIds: string[];
  }) => Promise<void>;
  initialValues?: Partial<RecurringTask>;
  title: string;
  saveLabel: string;
}) {
  const insets = useSafeAreaInsets();
  const [taskTitle, setTaskTitle] = useState(initialValues?.title ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [priority, setPriority] = useState<string | null>(initialValues?.priority ?? null);
  const [freqIdx, setFreqIdx] = useState(
    initialValues?.recurrenceConfig ? freqIndexFromConfig(initialValues.recurrenceConfig) : 0
  );
  const [tagsInput, setTagsInput] = useState((initialValues?.tags ?? []).join(", "));
  const [timeInput, setTimeInput] = useState(() => {
    try {
      const c = initialValues?.recurrenceConfig;
      const parsed = typeof c === "string" ? JSON.parse(c) : c;
      return (parsed as { time?: string })?.time ?? "";
    } catch { return ""; }
  });
  const [projectId, setProjectId] = useState<string | null>(initialValues?.projectId ?? null);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [projectsResult] = useQuery<{ projects: { id: string; name: string }[] }>({
    query: PROJECTS_QUERY,
    requestPolicy: "cache-and-network",
    pause: !visible,
  });
  const [profilesResult] = useQuery<{ profiles: { id: string; displayName: string }[] }>({
    query: PROFILES_QUERY,
    variables: { limit: 100 },
    requestPolicy: "cache-and-network",
    pause: !visible,
  });

  const allProjects = projectsResult.data?.projects ?? [];
  const allProfiles = profilesResult.data?.profiles ?? [];

  // Reset when modal opens
  const handleOpen = () => {
    setTaskTitle(initialValues?.title ?? "");
    setDescription(initialValues?.description ?? "");
    setPriority(initialValues?.priority ?? null);
    setFreqIdx(initialValues?.recurrenceConfig ? freqIndexFromConfig(initialValues.recurrenceConfig) : 0);
    setTagsInput((initialValues?.tags ?? []).join(", "));
    setProjectId(initialValues?.projectId ?? null);
    setAssigneeIds([]);
    try {
      const c = initialValues?.recurrenceConfig;
      const parsed = typeof c === "string" ? JSON.parse(c) : c;
      setTimeInput((parsed as { time?: string })?.time ?? "");
    } catch { setTimeInput(""); }
  };

  function pickProject() {
    const options = [
      { text: "None", onPress: () => setProjectId(null) },
      ...allProjects.map((p) => ({ text: p.name, onPress: () => setProjectId(p.id) })),
      { text: "Cancel", style: "cancel" as const },
    ];
    Alert.alert("Assign Project", undefined, options);
  }

  function pickAssignees() {
    const options = allProfiles.map((p) => ({
      text: assigneeIds.includes(p.id) ? `✓ ${p.displayName}` : p.displayName,
      onPress: () =>
        setAssigneeIds((prev) =>
          prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]
        ),
    }));
    Alert.alert("Assignees", "Tap to toggle", [...options, { text: "Done", style: "cancel" as const }]);
  }

  const selectedProject = allProjects.find((p) => p.id === projectId);
  const selectedAssigneeNames = allProfiles
    .filter((p) => assigneeIds.includes(p.id))
    .map((p) => p.displayName)
    .join(", ");

  const handleSave = async () => {
    if (!taskTitle.trim()) {
      Alert.alert("Missing title", "Please enter a title.");
      return;
    }
    setSaving(true);
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const baseConfig = JSON.parse(FREQUENCIES[freqIdx].value) as Record<string, unknown>;
    if (timeInput.trim()) baseConfig.time = timeInput.trim();
    await onSave({
      title: taskTitle.trim(),
      description: description.trim(),
      recurrenceConfig: JSON.stringify(baseConfig),
      priority: priority ?? null,
      tags,
      projectId: projectId ?? null,
      assigneeIds,
    });
    setSaving(false);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onShow={handleOpen}
    >
      <KeyboardAvoidingView
        className="flex-1 bg-gray-50 dark:bg-slate-900"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
          <TouchableOpacity onPress={onClose}>
            <Text className="text-base text-gray-500 dark:text-slate-400">Cancel</Text>
          </TouchableOpacity>
          <Text className="text-lg font-bold text-gray-900 dark:text-slate-100">{modalTitle}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#2563eb" />
              : <Text className="text-base font-bold text-blue-600 dark:text-blue-400">{saveLabel}</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title */}
          <FormField label="Title" required>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
              placeholder="Task title…"
              placeholderTextColor="#9ca3af"
              value={taskTitle}
              onChangeText={setTaskTitle}
              autoFocus
            />
          </FormField>

          {/* Description */}
          <FormField label="Description">
            <TextInput
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
              style={{ minHeight: 80, textAlignVertical: "top" }}
              placeholder="What should happen each time…"
              placeholderTextColor="#9ca3af"
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </FormField>

          {/* Frequency */}
          <View className="gap-2">
            <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Frequency</Text>
            <View className="flex-row flex-wrap gap-2">
              {FREQUENCIES.map((f, i) => (
                <FilterChip
                  key={f.label}
                  label={f.label}
                  active={freqIdx === i}
                  onPress={() => setFreqIdx(i)}
                />
              ))}
            </View>
          </View>

          {/* Priority */}
          <View className="gap-2">
            <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Priority</Text>
            <View className="flex-row flex-wrap gap-2">
              {([null, ...PRIORITIES] as (string | null)[]).map((p) => (
                <FilterChip
                  key={p ?? "none"}
                  label={p ?? "None"}
                  active={priority === p}
                  onPress={() => setPriority(p)}
                />
              ))}
            </View>
          </View>

          {/* Time */}
          <FormField label="Time (HH:MM)">
            <TextInput
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
              placeholder="09:00"
              placeholderTextColor="#9ca3af"
              value={timeInput}
              onChangeText={setTimeInput}
              returnKeyType="done"
              keyboardType="numbers-and-punctuation"
            />
          </FormField>

          {/* Tags */}
          <View className="gap-1.5">
            <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Tags</Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
              placeholder="bug, backend, api (comma-separated)"
              placeholderTextColor="#9ca3af"
              value={tagsInput}
              onChangeText={setTagsInput}
              returnKeyType="done"
            />
          </View>

          {/* Project */}
          <View className="gap-1.5">
            <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Project</Text>
            <TouchableOpacity
              onPress={pickProject}
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 flex-row items-center justify-between"
              activeOpacity={0.7}
            >
              <Text className={`text-base ${selectedProject ? "text-gray-900 dark:text-slate-100" : "text-gray-400 dark:text-slate-500"}`}>
                {selectedProject ? selectedProject.name : "None"}
              </Text>
              <Text className="text-xs text-gray-400 dark:text-slate-500">▼</Text>
            </TouchableOpacity>
          </View>

          {/* Assignees */}
          <View className="gap-1.5">
            <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Assignees</Text>
            <TouchableOpacity
              onPress={pickAssignees}
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3.5 py-3 flex-row items-center justify-between"
              activeOpacity={0.7}
            >
              <Text
                className={`text-base flex-1 ${selectedAssigneeNames ? "text-gray-900 dark:text-slate-100" : "text-gray-400 dark:text-slate-500"}`}
                numberOfLines={1}
              >
                {selectedAssigneeNames || "None"}
              </Text>
              <Text className="text-xs text-gray-400 dark:text-slate-500">▼</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RecurringTasksScreen() {
  const { profileId } = useAuth();
  const insets = useSafeAreaInsets();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTask, setEditTask] = useState<RecurringTask | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [search, setSearch] = useState("");

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [result, reexecute] = useQuery<{ recurringTasks: RecurringTask[] }>({
    query: RECURRING_TASKS_QUERY,
    variables: { includeInactive },
    requestPolicy: "cache-and-network",
    pause: !mounted,
  });

  const [, createTask] = useMutation(CREATE_RECURRING_TASK);
  const [, updateTask] = useMutation(UPDATE_RECURRING_TASK);
  const [, pauseTask] = useMutation(PAUSE_RECURRING_TASK);
  const [, resumeTask] = useMutation(RESUME_RECURRING_TASK);
  const [, triggerTask] = useMutation(TRIGGER_RECURRING_TASK);
  const [, deleteTask] = useMutation(DELETE_RECURRING_TASK);

  const allTasks = result.data?.recurringTasks ?? [];
  const q = search.trim().toLowerCase();
  const tasks = q
    ? allTasks.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      )
    : allTasks;

  const refresh = () => reexecute({ requestPolicy: "network-only" });

  function handleActions(task: RecurringTask) {
    Alert.alert(task.title, undefined, [
      {
        text: "✏️ Edit",
        onPress: () => setEditTask(task),
      },
      {
        text: "⚡ Generate Now",
        onPress: () => {
          Alert.alert(
            "Generate Task Now",
            "This will immediately create a task from this recurring blueprint.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Generate",
                onPress: async () => {
                  const res = await triggerTask({ id: task.id });
                  if (res.error) Alert.alert("Error", res.error.message ?? "Failed to trigger");
                  else { Alert.alert("Done", "Task generated successfully"); refresh(); }
                },
              },
            ]
          );
        },
      },
      {
        text: task.isActive ? "⏸ Pause" : "▶ Resume",
        onPress: async () => {
          const fn = task.isActive ? pauseTask : resumeTask;
          const res = await fn({ id: task.id });
          if (res.error) Alert.alert("Error", res.error.message ?? "Failed");
          else refresh();
        },
      },
      {
        text: "🗑️ Delete",
        style: "destructive",
        onPress: () => {
          Alert.alert("Delete Recurring Task", "This cannot be undone. Any tasks already generated will remain.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: async () => {
                const res = await deleteTask({ id: task.id });
                if (res.error) Alert.alert("Error", res.error.message ?? "Failed");
                else refresh();
              },
            },
          ]);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  if (result.fetching && tasks.length === 0) return <ScreenLoading />;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-slate-900">
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search recurring tasks…"
      />

      {/* Filter + Create toolbar */}
      <View className="flex-row p-3 gap-2 border-b border-gray-200 dark:border-slate-700">
        <TouchableOpacity
          onPress={() => setIncludeInactive(false)}
          className={`px-3 py-1.5 rounded-lg ${!includeInactive ? "bg-blue-600" : "bg-gray-100 dark:bg-slate-700"}`}
          activeOpacity={0.7}
        >
          <Text className={`text-sm font-semibold ${!includeInactive ? "text-white" : "text-gray-700 dark:text-slate-300"}`}>Active</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setIncludeInactive(true)}
          className={`px-3 py-1.5 rounded-lg ${includeInactive ? "bg-blue-600" : "bg-gray-100 dark:bg-slate-700"}`}
          activeOpacity={0.7}
        >
          <Text className={`text-sm font-semibold ${includeInactive ? "text-white" : "text-gray-700 dark:text-slate-300"}`}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setCreateOpen(true)}
          className="ml-auto px-3.5 py-1.5 rounded-lg bg-blue-600"
          activeOpacity={0.7}
        >
          <Text className="text-sm font-bold text-white">+ New</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24 }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={result.fetching && tasks.length > 0}
            onRefresh={refresh}
            tintColor="#2563eb"
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="repeat-outline"
            message="No recurring tasks yet"
            action={{ label: "Create one", onPress: () => setCreateOpen(true) }}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className={`bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 gap-2 ${item.isActive ? "" : "opacity-60"}`}
            onPress={() => handleActions(item)}
            activeOpacity={0.7}
          >
            {/* Header */}
            <View className="flex-row items-center gap-2">
              <Text className="text-base">{item.isActive ? "🔄" : "⏸"}</Text>
              {item.priority && <PriorityBadge priority={item.priority} />}
              <Text className="text-xs text-gray-400 dark:text-slate-500 ml-auto">
                {parseFreqLabel(item.recurrenceConfig)}
              </Text>
              {/* Edit shortcut */}
              <TouchableOpacity
                onPress={() => setEditTask(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text className="text-sm text-blue-600 dark:text-blue-400">✏️</Text>
              </TouchableOpacity>
            </View>

            {/* Title */}
            <Text className="text-base font-semibold text-gray-900 dark:text-slate-100 leading-tight" numberOfLines={2}>
              {item.title}
            </Text>

            {/* Description */}
            {item.description ? (
              <Text className="text-sm text-gray-500 dark:text-slate-400" numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}

            {/* Footer */}
            <View className="flex-row items-center gap-2 flex-wrap">
              <StatusPill status={item.isActive ? "active" : "paused"} />
              {item.nextDueAt && (
                <Text className="text-xs text-gray-400 dark:text-slate-500">
                  Next: {formatDate(item.nextDueAt)}
                </Text>
              )}
              {item.lastGeneratedAt && (
                <Text className="text-xs text-gray-400 dark:text-slate-500">
                  Last: {formatDate(item.lastGeneratedAt)}
                </Text>
              )}
              {item.tags.length > 0 && (
                <Text className="text-xs text-gray-400 dark:text-slate-500">
                  {item.tags.join(", ")}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Create Modal */}
      <RecurringTaskFormModal
        visible={createOpen}
        title="New Recurring Task"
        saveLabel="Create"
        onClose={() => setCreateOpen(false)}
        onSave={async (values) => {
          const { projectId: pid, assigneeIds: aids, ...rest } = values;
          const res = await createTask({
            ...rest,
            projectId: pid ?? undefined,
            assigneeIds: aids.length ? aids : undefined,
            createdByProfileId: profileId ?? undefined,
          });
          if (res.error) {
            Alert.alert("Error", res.error.message ?? "Failed to create");
          } else {
            setCreateOpen(false);
            refresh();
          }
        }}
      />

      {/* Edit Modal */}
      <RecurringTaskFormModal
        visible={editTask !== null}
        title="Edit Recurring Task"
        saveLabel="Save"
        initialValues={editTask ?? undefined}
        onClose={() => setEditTask(null)}
        onSave={async (values) => {
          if (!editTask) return;
          const { projectId: pid, assigneeIds: aids, ...rest } = values;
          const res = await updateTask({
            id: editTask.id,
            ...rest,
            projectId: pid ?? undefined,
            assigneeIds: aids.length ? aids : undefined,
          });
          if (res.error) {
            Alert.alert("Error", res.error.message ?? "Failed to update");
          } else {
            setEditTask(null);
            refresh();
          }
        }}
      />
    </View>
  );
}
