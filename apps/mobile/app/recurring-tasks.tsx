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
import { formatDate } from "@agentcenter/utils";
import { useTheme } from "../src/hooks/useTheme";
import { EmptyState } from "../src/components/EmptyState";
import { StatusPill } from "../src/components/StatusPill";
import { PriorityBadge } from "../src/components/PriorityBadge";
import { useAuth } from "../src/context/AuthContext";

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

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;



function parseFreqLabel(config: unknown): string {
  try {
    const c = (typeof config === "string" ? JSON.parse(config) : config) as {
      frequency?: string; interval?: number; daysOfWeek?: number[]; dayOfMonth?: number;
      time?: string; type?: string;
    };
    if (c.frequency === "daily") return "Daily";
    if (c.frequency === "weekly") {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayNames = (c.daysOfWeek ?? []).map((d) => days[d]).join(", ");
      return c.interval ? `Every ${c.interval}w · ${dayNames}` : `Weekly · ${dayNames}`;
    }
    if (c.frequency === "monthly") return `Monthly · day ${c.dayOfMonth ?? 1}`;
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
  const { colors } = useTheme();
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
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
        }}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 16, color: colors.textSecondary }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text }}>{modalTitle}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator color={colors.accent} />
              : <Text style={{ fontSize: 16, fontWeight: "700", color: colors.accent }}>{saveLabel}</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary }}>Title *</Text>
            <TextInput
              style={{
                backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text,
              }}
              placeholder="Task title…"
              placeholderTextColor={colors.placeholder}
              value={taskTitle}
              onChangeText={setTaskTitle}
              autoFocus
            />
          </View>

          {/* Description */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary }}>Description</Text>
            <TextInput
              style={{
                backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
                fontSize: 15, color: colors.text, minHeight: 80, textAlignVertical: "top",
              }}
              placeholder="What should happen each time…"
              placeholderTextColor={colors.placeholder}
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </View>

          {/* Frequency */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary }}>Frequency</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {FREQUENCIES.map((f, i) => (
                <TouchableOpacity
                  key={f.label}
                  onPress={() => setFreqIdx(i)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5,
                    borderColor: freqIdx === i ? colors.accent : colors.border,
                    backgroundColor: freqIdx === i ? colors.accentSurface : colors.inputBg,
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: freqIdx === i ? colors.accent : colors.textSecondary }}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Priority */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary }}>Priority</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {([null, ...PRIORITIES] as (string | null)[]).map((p) => (
                <TouchableOpacity
                  key={p ?? "none"}
                  onPress={() => setPriority(p)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
                    borderColor: priority === p ? colors.accent : colors.border,
                    backgroundColor: priority === p ? colors.accentSurface : colors.inputBg,
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, color: priority === p ? colors.accent : colors.textSecondary, textTransform: "capitalize" }}>
                    {p ?? "None"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Time */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary }}>Time (HH:MM)</Text>
            <TextInput
              style={{
                backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text,
              }}
              placeholder="09:00"
              placeholderTextColor={colors.placeholder}
              value={timeInput}
              onChangeText={setTimeInput}
              returnKeyType="done"
              keyboardType="numbers-and-punctuation"
            />
          </View>

          {/* Tags */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary }}>Tags</Text>
            <TextInput
              style={{
                backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text,
              }}
              placeholder="bug, backend, api (comma-separated)"
              placeholderTextColor={colors.placeholder}
              value={tagsInput}
              onChangeText={setTagsInput}
              returnKeyType="done"
            />
          </View>

          {/* Project */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary }}>Project</Text>
            <TouchableOpacity
              onPress={pickProject}
              style={{
                backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 15, color: selectedProject ? colors.text : colors.placeholder }}>
                {selectedProject ? selectedProject.name : "None"}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>▼</Text>
            </TouchableOpacity>
          </View>

          {/* Assignees */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary }}>Assignees</Text>
            <TouchableOpacity
              onPress={pickAssignees}
              style={{
                backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 15, color: selectedAssigneeNames ? colors.text : colors.placeholder }} numberOfLines={1}>
                {selectedAssigneeNames || "None"}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>▼</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RecurringTasksScreen() {
  const { colors } = useTheme();
  const { profileId } = useAuth();
  const insets = useSafeAreaInsets();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTask, setEditTask] = useState<RecurringTask | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [result, reexecute] = useQuery<{ recurringTasks: RecurringTask[] }>({
    query: RECURRING_TASKS_QUERY,
    variables: { includeInactive },
    requestPolicy: "cache-and-network",
  });

  const [, createTask] = useMutation(CREATE_RECURRING_TASK);
  const [, updateTask] = useMutation(UPDATE_RECURRING_TASK);
  const [, pauseTask] = useMutation(PAUSE_RECURRING_TASK);
  const [, resumeTask] = useMutation(RESUME_RECURRING_TASK);
  const [, triggerTask] = useMutation(TRIGGER_RECURRING_TASK);
  const [, deleteTask] = useMutation(DELETE_RECURRING_TASK);

  const tasks = result.data?.recurringTasks ?? [];

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

  if (result.fetching && tasks.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Filter + Create toolbar */}
      <View style={{ flexDirection: "row", padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity
          onPress={() => setIncludeInactive(false)}
          style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: !includeInactive ? colors.accent : colors.surfaceAlt }}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: !includeInactive ? "#fff" : colors.textSecondary }}>Active</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setIncludeInactive(true)}
          style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: includeInactive ? colors.accent : colors.surfaceAlt }}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: includeInactive ? "#fff" : colors.textSecondary }}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setCreateOpen(true)}
          style={{ marginLeft: "auto", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.accent }}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>+ New</Text>
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
            tintColor={colors.accent}
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
            style={{
              backgroundColor: colors.card, borderRadius: 12, padding: 14,
              borderWidth: 1, borderColor: colors.border, gap: 8,
              opacity: item.isActive ? 1 : 0.6,
            }}
            onPress={() => handleActions(item)}
            activeOpacity={0.7}
          >
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 16 }}>{item.isActive ? "🔄" : "⏸"}</Text>
              {item.priority && <PriorityBadge priority={item.priority} />}
              <Text style={{ fontSize: 12, color: colors.textMuted, marginLeft: "auto" }}>
                {parseFreqLabel(item.recurrenceConfig)}
              </Text>
              {/* Edit shortcut */}
              <TouchableOpacity
                onPress={() => setEditTask(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ fontSize: 13, color: colors.accent }}>✏️</Text>
              </TouchableOpacity>
            </View>

            {/* Title */}
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text, lineHeight: 21 }} numberOfLines={2}>
              {item.title}
            </Text>

            {/* Description */}
            {item.description ? (
              <Text style={{ fontSize: 13, color: colors.textSecondary }} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}

            {/* Footer */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <StatusPill status={item.isActive ? "active" : "paused"} />
              {item.nextDueAt && (
                <Text style={{ fontSize: 11, color: colors.textMuted }}>
                  Next: {formatDate(item.nextDueAt)}
                </Text>
              )}
              {item.lastGeneratedAt && (
                <Text style={{ fontSize: 11, color: colors.textMuted }}>
                  Last: {formatDate(item.lastGeneratedAt)}
                </Text>
              )}
              {item.tags.length > 0 && (
                <Text style={{ fontSize: 11, color: colors.textMuted }}>
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
