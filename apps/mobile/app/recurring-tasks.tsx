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
  PAUSE_RECURRING_TASK,
  RESUME_RECURRING_TASK,
  DELETE_RECURRING_TASK,
} from "@agentcenter/graphql-client";
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
  recurrenceConfig: string;
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

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function parseFreqLabel(config: string): string {
  try {
    const c = JSON.parse(config) as { frequency?: string; interval?: number; daysOfWeek?: number[]; dayOfMonth?: number };
    if (c.frequency === "daily") return "Daily";
    if (c.frequency === "weekly") {
      const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const dayNames = (c.daysOfWeek ?? []).map((d) => days[d]).join(", ");
      return c.interval ? `Every ${c.interval}w · ${dayNames}` : `Weekly · ${dayNames}`;
    }
    if (c.frequency === "monthly") return `Monthly · day ${c.dayOfMonth ?? 1}`;
    return config;
  } catch {
    return config;
  }
}

// ── Create modal ──────────────────────────────────────────────────────────────

function CreateRecurringTaskModal({ visible, onClose, onCreated }: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { colors } = useTheme();
  const { profileId } = useAuth();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string | null>(null);
  const [freqIdx, setFreqIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  const [, createTask] = useMutation(CREATE_RECURRING_TASK);

  async function handleCreate() {
    if (!title.trim()) {
      Alert.alert("Missing title", "Please enter a title.");
      return;
    }
    setLoading(true);
    const res = await createTask({
      title: title.trim(),
      description: description.trim(),
      recurrenceConfig: FREQUENCIES[freqIdx].value,
      priority: priority ?? undefined,
      createdByProfileId: profileId ?? undefined,
    });
    setLoading(false);
    if (res.error) {
      Alert.alert("Error", res.error.message ?? "Failed to create");
    } else {
      setTitle("");
      setDescription("");
      setPriority(null);
      setFreqIdx(0);
      onCreated();
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 16, color: colors.textSecondary }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text }}>New Recurring Task</Text>
          <TouchableOpacity onPress={handleCreate} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.accent} /> : <Text style={{ fontSize: 16, fontWeight: "700", color: colors.accent }}>Create</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
          {/* Title */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary }}>Title *</Text>
            <TextInput
              style={{ backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text }}
              placeholder="Task title…"
              placeholderTextColor={colors.placeholder}
              value={title}
              onChangeText={setTitle}
              autoFocus
            />
          </View>

          {/* Description */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary }}>Description</Text>
            <TextInput
              style={{ backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, minHeight: 80, textAlignVertical: "top" }}
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
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 8,
                    borderWidth: 1.5,
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
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[null, ...PRIORITIES].map((p) => (
                <TouchableOpacity
                  key={p ?? "none"}
                  onPress={() => setPriority(p)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    borderWidth: 1,
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
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RecurringTasksScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [createOpen, setCreateOpen] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [result, reexecute] = useQuery<{ recurringTasks: RecurringTask[] }>({
    query: RECURRING_TASKS_QUERY,
    variables: { includeInactive },
    requestPolicy: "cache-and-network",
  });

  const [, pauseTask] = useMutation(PAUSE_RECURRING_TASK);
  const [, resumeTask] = useMutation(RESUME_RECURRING_TASK);
  const [, deleteTask] = useMutation(DELETE_RECURRING_TASK);

  const tasks = result.data?.recurringTasks ?? [];

  function handleActions(task: RecurringTask) {
    Alert.alert(task.title, undefined, [
      {
        text: task.isActive ? "⏸ Pause" : "▶ Resume",
        onPress: async () => {
          const fn = task.isActive ? pauseTask : resumeTask;
          const res = await fn({ id: task.id });
          if (res.error) Alert.alert("Error", res.error.message ?? "Failed");
          else reexecute({ requestPolicy: "network-only" });
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
                else reexecute({ requestPolicy: "network-only" });
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
      {/* Filter toggle */}
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
            onRefresh={() => reexecute({ requestPolicy: "network-only" })}
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
              backgroundColor: colors.card,
              borderRadius: 12,
              padding: 14,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 8,
              opacity: item.isActive ? 1 : 0.6,
            }}
            onPress={() => handleActions(item)}
            activeOpacity={0.7}
          >
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 16, }}>
                {item.isActive ? "🔄" : "⏸"}
              </Text>
              {item.priority && <PriorityBadge priority={item.priority} />}
              <Text style={{ fontSize: 12, color: colors.textMuted, marginLeft: "auto" }}>
                {parseFreqLabel(item.recurrenceConfig)}
              </Text>
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
                  Next: {fmtDate(item.nextDueAt)}
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

      <CreateRecurringTaskModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          reexecute({ requestPolicy: "network-only" });
        }}
      />
    </View>
  );
}
