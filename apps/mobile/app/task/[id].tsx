import {
  View,
  Text,
  ScrollView,
  FlatList,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useSubscription } from "urql";
import { useState, useEffect, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  TASK_QUERY,
  TASK_BY_NUMBER_QUERY,
  AGENTS_FOR_TASK_QUERY,
  PROJECTS_QUERY,
  MESSAGES_BY_TASK_QUERY,
  DELIVERABLES_BY_TASK_QUERY,
  DELIVERABLES_BY_CHILD_TASKS_QUERY,
  CHILD_TASKS_QUERY,
  TASK_WORK_SUMMARY_QUERY,
  ON_TASK_UPDATED,
  ON_NEW_MESSAGE,
} from "@agentcenter/graphql-client";
import { UPDATE_TASK, CREATE_MESSAGE, TOGGLE_MESSAGE_REACTION, REQUEST_CLARIFICATION, APPROVE_TASK, REJECT_TASK, SAVE_TASK_AS_TEMPLATE } from "@agentcenter/graphql-client";
import { STATUS_HEX_COLORS, PRIORITY_HEX_COLORS, TASK_STATUSES, DEFAULT_COLOR, DEFAULT_AGENT_EMOJI, formatRelativeTime, formatDate, humanizeLabel, DELIVERABLE_KIND_HEX_COLORS, DELIVERABLE_KIND_ICONS, formatDuration } from "@agentcenter/utils";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/hooks/useTheme";
import { MentionInput } from "../../src/components/MentionInput";
import { SimpleMarkdown } from "../../src/components/SimpleMarkdown";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Profile {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
}

interface TaskAssignee {
  id: string;
  profileId: string;
  assignedAt: string | null;
  profile: Profile & {
    agentId: string | null;
    agent: { id: string; name: string; identityEmoji: string | null; status: string } | null;
  };
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
  createdAt: string;
  updatedAt: string;
  parentTaskId: string | null;
  projectId: string | null;
  createdByProfile: Profile | null;
  parentTask: { id: string; title: string; taskNumber: number; status: string } | null;
  blockedByTask: { id: string; title: string; taskNumber: number; status: string } | null;
  project: { id: string; name: string } | null;
  assignees: TaskAssignee[];
}

interface ChildTask {
  id: string;
  title: string;
  taskNumber: number;
  status: string;
  priority: string | null;
}

interface MessageReaction {
  id: string;
  profileId: string;
  emoji: string;
}

interface Message {
  id: string;
  taskId: string;
  fromProfileId: string;
  content: string;
  createdAt: string;
  fromProfile: Profile;
  reactions: MessageReaction[];
}

interface Deliverable {
  id: string;
  title: string;
  kind: string;
  content: string | null;
  language: string | null;
  fileName: string | null;
  url: string | null;
  version: number;
  createdAt: string;
  profile: Profile;
}

// ── Constants ─────────────────────────────────────────────────────────────────


const KIND_ICONS = DELIVERABLE_KIND_ICONS;

// ── Helpers ───────────────────────────────────────────────────────────────────



// ── Reject Modal ──────────────────────────────────────────────────────────────

function RejectModal({
  visible,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string, changes: string[]) => void;
}) {
  const [reason, setReason] = useState("");
  const [changeText, setChangeText] = useState("");
  const [changes, setChanges] = useState<string[]>([]);

  function addChange() {
    const t = changeText.trim();
    if (!t) return;
    setChanges((c) => [...c, t]);
    setChangeText("");
  }

  function removeChange(i: number) {
    setChanges((c) => c.filter((_, idx) => idx !== i));
  }

  function handleConfirm() {
    if (!reason.trim()) {
      Alert.alert("Error", "Rejection reason is required");
      return;
    }
    onConfirm(reason.trim(), changes);
    setReason("");
    setChangeText("");
    setChanges([]);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <View className="flex-1 bg-white dark:bg-slate-800">
          <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-gray-200 dark:border-slate-700">
            <Text className="text-lg font-bold text-gray-900 dark:text-slate-100">Reject Task</Text>
            <TouchableOpacity onPress={onClose} className="p-1">
              <Text className="text-xl text-gray-700 dark:text-slate-300">✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Rejection Reason *</Text>
              <TextInput
                className="border border-gray-300 dark:border-slate-600 rounded-lg p-2.5 text-base text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-900"
                style={{ height: 80 }}
                value={reason}
                onChangeText={setReason}
                placeholder="Why is this being rejected?"
                multiline
                textAlignVertical="top"
              />
            </View>
            <View style={{ gap: 6 }}>
              <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Changes Needed</Text>
              <View className="flex-row gap-2">
                <TextInput
                  className="flex-1 border border-gray-300 dark:border-slate-600 rounded-lg p-2.5 text-base text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-900"
                  value={changeText}
                  onChangeText={setChangeText}
                  placeholder="Add a required change"
                  returnKeyType="done"
                  onSubmitEditing={addChange}
                />
                <TouchableOpacity className="bg-blue-600 rounded-lg px-3.5 py-2.5 justify-center" onPress={addChange}>
                  <Text className="text-white font-semibold">Add</Text>
                </TouchableOpacity>
              </View>
              {changes.map((c, i) => (
                <View key={i} className="flex-row items-center gap-2 py-1">
                  <Text className="flex-1 text-sm text-gray-700 dark:text-slate-300" numberOfLines={2}>• {c}</Text>
                  <TouchableOpacity onPress={() => removeChange(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text className="text-red-600 text-base">✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <TouchableOpacity className="bg-red-600 rounded-xl p-3.5 items-center" onPress={handleConfirm}>
              <Text className="text-white font-bold text-base">Reject Task</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Clarify Modal ─────────────────────────────────────────────────────────────

function ClarifyModal({
  visible,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (questions: string[]) => void;
}) {
  const [questionText, setQuestionText] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);

  function addQuestion() {
    const t = questionText.trim();
    if (!t) return;
    setQuestions((q) => [...q, t]);
    setQuestionText("");
  }

  function removeQuestion(i: number) {
    setQuestions((q) => q.filter((_, idx) => idx !== i));
  }

  function handleConfirm() {
    if (questions.length === 0 && !questionText.trim()) {
      Alert.alert("Error", "Add at least one question");
      return;
    }
    const all = questionText.trim()
      ? [...questions, questionText.trim()]
      : questions;
    onConfirm(all);
    setQuestionText("");
    setQuestions([]);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <View className="flex-1 bg-white dark:bg-slate-800">
          <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-gray-200 dark:border-slate-700">
            <Text className="text-lg font-bold text-gray-900 dark:text-slate-100">Request Clarification</Text>
            <TouchableOpacity onPress={onClose} className="p-1">
              <Text className="text-xl text-gray-700 dark:text-slate-300">✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Questions</Text>
              <View className="flex-row gap-2">
                <TextInput
                  className="flex-1 border border-gray-300 dark:border-slate-600 rounded-lg p-2.5 text-base text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-900"
                  value={questionText}
                  onChangeText={setQuestionText}
                  placeholder="Add a question"
                  returnKeyType="done"
                  onSubmitEditing={addQuestion}
                />
                <TouchableOpacity className="bg-blue-600 rounded-lg px-3.5 py-2.5 justify-center" onPress={addQuestion}>
                  <Text className="text-white font-semibold">Add</Text>
                </TouchableOpacity>
              </View>
              {questions.map((q, i) => (
                <View key={i} className="flex-row items-center gap-2 py-1">
                  <Text className="flex-1 text-sm text-gray-700 dark:text-slate-300" numberOfLines={2}>• {q}</Text>
                  <TouchableOpacity onPress={() => removeQuestion(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text className="text-red-600 text-base">✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <TouchableOpacity
              className="bg-violet-700 rounded-xl p-3.5 items-center"
              onPress={handleConfirm}
            >
              <Text className="text-white font-bold text-base">Send Questions</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Approve Modal ─────────────────────────────────────────────────────────────

function ApproveModal({
  visible,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (comment: string, childTasks: Array<{ title: string; description?: string }>) => void;
}) {
  const [comment, setComment] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [childTasks, setChildTasks] = useState<Array<{ title: string }>>([]);

  function addChildTask() {
    const t = taskTitle.trim();
    if (!t) return;
    setChildTasks((c) => [...c, { title: t }]);
    setTaskTitle("");
  }

  function removeChildTask(i: number) {
    setChildTasks((c) => c.filter((_, idx) => idx !== i));
  }

  function handleConfirm() {
    onConfirm(comment.trim(), childTasks);
    setComment("");
    setTaskTitle("");
    setChildTasks([]);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <View className="flex-1 bg-white dark:bg-slate-800">
          <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-gray-200 dark:border-slate-700">
            <Text className="text-lg font-bold text-gray-900 dark:text-slate-100">Approve Task</Text>
            <TouchableOpacity onPress={onClose} className="p-1">
              <Text className="text-xl text-gray-700 dark:text-slate-300">✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Approval Comment (optional)</Text>
              <TextInput
                className="border border-gray-300 dark:border-slate-600 rounded-lg p-2.5 text-base text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-900"
                style={{ height: 72 }}
                value={comment}
                onChangeText={setComment}
                placeholder="Great work! The task looks good."
                multiline
                textAlignVertical="top"
              />
            </View>
            <View style={{ gap: 6 }}>
              <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Spawn Follow-up Tasks (optional)</Text>
              <View className="flex-row gap-2">
                <TextInput
                  className="flex-1 border border-gray-300 dark:border-slate-600 rounded-lg p-2.5 text-base text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-900"
                  value={taskTitle}
                  onChangeText={setTaskTitle}
                  placeholder="Follow-up task title"
                  returnKeyType="done"
                  onSubmitEditing={addChildTask}
                />
                <TouchableOpacity className="bg-blue-600 rounded-lg px-3.5 py-2.5 justify-center" onPress={addChildTask}>
                  <Text className="text-white font-semibold">Add</Text>
                </TouchableOpacity>
              </View>
              {childTasks.map((ct, i) => (
                <View key={i} className="flex-row items-center gap-2 py-1">
                  <Text className="flex-1 text-sm text-gray-700 dark:text-slate-300" numberOfLines={1}>• {ct.title}</Text>
                  <TouchableOpacity onPress={() => removeChildTask(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text className="text-red-600 text-base">✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <TouchableOpacity
              className="bg-green-600 rounded-xl p-3.5 items-center"
              onPress={handleConfirm}
            >
              <Text className="text-white font-bold text-base">✓ Approve Task</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TabBar({
  tabs,
  active,
  onPress,
}: {
  tabs: string[];
  active: number;
  onPress: (i: number) => void;
}) {
  return (
    <View className="flex-row bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 min-h-12">
      {tabs.map((tab, i) => (
        <TouchableOpacity
          key={tab}
          className={`flex-1 py-3 items-center justify-center border-b-2 ${active === i ? "border-blue-600" : "border-transparent"}`}
          onPress={() => onPress(i)}
          activeOpacity={0.7}
        >
          <Text className={`text-sm ${active === i ? "text-blue-600 font-semibold" : "text-gray-500 dark:text-slate-400 font-medium"}`}>{tab}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

interface WorkSummary {
  totalWorkTimeMs: number;
  activeSessionCount: number;
  agentBreakdown: { agentId: string; agentName: string; totalMs: number }[];
}


function OverviewTab({ task, onStatusChange, onProjectAssign }: { task: Task; onStatusChange: () => void; onProjectAssign: (projectId: string) => void }) {
  const router = useRouter();
  const statusColor = STATUS_HEX_COLORS[task.status] ?? DEFAULT_COLOR;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [projectsResult] = useQuery<{ projects: { id: string; name: string; status: string }[] }>({
    query: PROJECTS_QUERY,
    requestPolicy: "cache-and-network",
    pause: !mounted || !!task.project,
  });

  function handleAssignProject() {
    const projects = (projectsResult.data?.projects ?? []).filter((p) => p.status === "active");
    if (projects.length === 0) { Alert.alert("No Projects", "No active projects available."); return; }
    Alert.alert(
      "Assign to Project",
      "Select a project for this task",
      [
        ...projects.map((p) => ({ text: p.name, onPress: () => onProjectAssign(p.id) })),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  }

  const [childResult] = useQuery<{ childTasks: ChildTask[] }>({
    query: CHILD_TASKS_QUERY,
    variables: { parentTaskId: task.id },
    requestPolicy: "cache-and-network",
    pause: !mounted || !task.id,
  });
  const childTasks = childResult.data?.childTasks ?? [];

  const [workResult] = useQuery<{ taskWorkSummary: WorkSummary | null }>({
    query: TASK_WORK_SUMMARY_QUERY,
    variables: { taskId: task.id },
    requestPolicy: "cache-and-network",
    pause: !mounted,
  });
  const workSummary = workResult.data?.taskWorkSummary;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      {/* Title */}
      <Text className="text-xl font-bold text-gray-900 dark:text-slate-100 leading-7">{task.title}</Text>

      {/* Badges */}
      <View className="flex-row flex-wrap gap-2 items-center">
        <TouchableOpacity
          style={{ backgroundColor: statusColor + "22", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}
          onPress={onStatusChange}
          activeOpacity={0.7}
        >
          <Text style={{ color: statusColor }} className="text-sm font-semibold">
            {humanizeLabel(task.status)}
          </Text>
        </TouchableOpacity>
        {task.priority && (
          <View
            style={{ backgroundColor: (PRIORITY_HEX_COLORS[task.priority] ?? DEFAULT_COLOR) + "22", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}
          >
            <Text
              style={{ color: PRIORITY_HEX_COLORS[task.priority] ?? DEFAULT_COLOR, textTransform: "capitalize" }}
              className="text-sm font-semibold"
            >
              {task.priority}
            </Text>
          </View>
        )}
        {task.project ? (
          <TouchableOpacity
            className="rounded-md px-2.5 py-1 bg-gray-100 dark:bg-slate-700"
            onPress={() => router.push(`/project/${task.project!.id}`)}
          >
            <Text className="text-sm font-semibold text-gray-500 dark:text-slate-400">📁 {task.project.name}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            className="rounded-md px-2.5 py-1 bg-gray-100 dark:bg-slate-700 border border-dashed border-gray-300 dark:border-slate-600"
            onPress={handleAssignProject}
            activeOpacity={0.7}
          >
            <Text className="text-sm font-semibold text-gray-400 dark:text-slate-500">📁 Assign project</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Blocked-by dependency */}
      {task.blockedByTask && (
        <TouchableOpacity
          className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 border border-red-200 dark:border-red-800 gap-1.5"
          onPress={() => router.push(`/task/${task.blockedByTask!.id}`)}
          activeOpacity={0.8}
        >
          <Text className="text-xs font-bold text-red-600">🚫 Blocked by</Text>
          <View className="flex-row items-center gap-1.5">
            <Text className="text-xs text-gray-400 dark:text-slate-500 font-medium">#{task.blockedByTask.taskNumber}</Text>
            <Text className="text-sm text-gray-900 dark:text-slate-100 flex-1 font-medium" numberOfLines={1}>
              {task.blockedByTask.title}
            </Text>
            <View
              style={{
                backgroundColor: (STATUS_HEX_COLORS[task.blockedByTask.status] ?? DEFAULT_COLOR) + "22",
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
              }}
            >
              <Text
                style={{ color: STATUS_HEX_COLORS[task.blockedByTask.status] ?? DEFAULT_COLOR, textTransform: "capitalize" }}
                className="text-xs font-semibold"
              >
                {task.blockedByTask.status.replace("_", " ")}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* Description */}
      {task.description ? (
        <View className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 gap-2.5">
          <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.6px]">Description</Text>
          <SimpleMarkdown content={task.description} />
        </View>
      ) : null}

      {/* Assignees */}
      {task.assignees.length > 0 && (
        <View className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 gap-2.5">
          <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.6px]">Assignees</Text>
          {task.assignees.map((a) => (
            <View key={a.id} className="flex-row items-center gap-2.5">
              <Text className="text-xl">
                {a.profile.agent?.identityEmoji ?? "👤"}
              </Text>
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-900 dark:text-slate-100">{a.profile.displayName}</Text>
                {a.profile.agent && (
                  <Text className="text-xs text-gray-500 dark:text-slate-400 mt-px">{humanizeLabel(a.profile.agent.status)}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Subtasks */}
      {(childTasks.length > 0 || childResult.fetching) && (
        <View className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 gap-2.5">
          <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.6px]">Subtasks ({childTasks.length})</Text>
          {childResult.fetching ? (
            <ActivityIndicator size="small" color="#2563eb" />
          ) : (
            childTasks.map((ct) => (
              <TouchableOpacity
                key={ct.id}
                className="flex-row items-center gap-2 py-1"
                onPress={() => router.push(`/task/${ct.id}`)}
                activeOpacity={0.7}
              >
                <View
                  style={{ backgroundColor: STATUS_HEX_COLORS[ct.status] ?? DEFAULT_COLOR, width: 8, height: 8, borderRadius: 4 }}
                />
                <Text className="text-xs text-gray-400 dark:text-slate-500 font-medium w-8">#{ct.taskNumber}</Text>
                <Text className="text-sm text-gray-700 dark:text-slate-300 flex-1" numberOfLines={1}>
                  {ct.title}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      {/* Details */}
      <View className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 gap-2.5">
        <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.6px]">Details</Text>
        <DetailRow label="Due Date" value={formatDate(task.dueDate)} />
        <DetailRow label="Created" value={formatDate(task.createdAt)} />
        {task.createdByProfile && (
          <DetailRow label="Created by" value={task.createdByProfile.displayName} />
        )}
        {task.parentTask && (
          <TouchableOpacity
            onPress={() => router.push(`/task/${task.parentTask!.id}`)}
          >
            <DetailRow
              label="Parent Task"
              value={`#${task.parentTask.taskNumber} ${task.parentTask.title}`}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Tags */}
      {task.tags.length > 0 && (
        <View className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 gap-2.5">
          <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.6px]">Tags</Text>
          <View className="flex-row flex-wrap gap-1.5">
            {task.tags.map((tag) => (
              <View key={tag} className="bg-blue-50 dark:bg-blue-900/30 rounded px-2 py-1">
                <Text className="text-xs text-blue-600 font-medium">{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Work time */}
      {workSummary && workSummary.totalWorkTimeMs > 0 && (
        <View className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 gap-2.5">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.6px]">Work Time</Text>
            {workSummary.activeSessionCount > 0 && (
              <View className="flex-row items-center gap-1">
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#16a34a" }} />
                <Text style={{ fontSize: 11, color: "#16a34a", fontWeight: "600" }}>
                  {workSummary.activeSessionCount} active
                </Text>
              </View>
            )}
          </View>
          <Text className="text-xl font-bold text-gray-900 dark:text-slate-100 mt-1">
            {formatDuration(workSummary.totalWorkTimeMs)}
          </Text>
          {workSummary.agentBreakdown.map((ab) => (
            <View key={ab.agentId} className="flex-row justify-between gap-3">
              <Text className="text-sm text-gray-500 dark:text-slate-400 w-24" numberOfLines={1}>{ab.agentName}</Text>
              <Text className="text-sm text-gray-900 dark:text-slate-100 flex-1 text-right">{formatDuration(ab.totalMs)}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text className="text-sm text-gray-500 dark:text-slate-400 w-24">{label}</Text>
      <Text className="text-sm text-gray-900 dark:text-slate-100 flex-1 text-right">{value}</Text>
    </View>
  );
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "✅"];

function MessagesTab({ taskId, profileId }: { taskId: string; profileId: string | null }) {
  const [text, setText] = useState("");
  const listRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();

  const [result, reexecute] = useQuery<{ messagesByTask: Message[] }>({
    query: MESSAGES_BY_TASK_QUERY,
    variables: { taskId },
    requestPolicy: "cache-and-network",
  });

  // Live message subscription — refetch when a new message arrives
  const [messageSub] = useSubscription<{ newMessage: { id: string } }>({
    query: ON_NEW_MESSAGE,
    variables: { taskId },
  });
  const prevSubMsg = useRef<unknown>(null);
  useEffect(() => {
    if (messageSub.data && messageSub.data !== prevSubMsg.current) {
      prevSubMsg.current = messageSub.data;
      reexecute({ requestPolicy: "network-only" });
    }
  }, [messageSub.data]);

  const [, sendMessage] = useMutation(CREATE_MESSAGE);
  const [, toggleReaction] = useMutation(TOGGLE_MESSAGE_REACTION);

  const messages = result.data?.messagesByTask ?? [];

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, [messages.length]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || !profileId) return;
    setText("");
    const res = await sendMessage({ taskId, fromProfileId: profileId, content });
    if (res.error) {
      Alert.alert("Error", "Failed to send message");
      setText(content);
    } else {
      reexecute({ requestPolicy: "network-only" });
    }
  };

  if (result.fetching && messages.length === 0) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900">
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 + insets.bottom : 0}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={[
          { padding: 16, gap: 16 },
          messages.length === 0 && { flex: 1, justifyContent: "center", alignItems: "center" },
        ]}
        ListEmptyComponent={
          <Text className="text-base text-gray-400 dark:text-slate-500 text-center">No messages yet. Start the conversation.</Text>
        }
        renderItem={({ item }) => {
          const reactionGroups: Record<string, { emoji: string; count: number; iMine: boolean }> = {};
          for (const r of item.reactions ?? []) {
            if (!reactionGroups[r.emoji]) reactionGroups[r.emoji] = { emoji: r.emoji, count: 0, iMine: false };
            reactionGroups[r.emoji].count++;
            if (r.profileId === profileId) reactionGroups[r.emoji].iMine = true;
          }
          const reactionList = Object.values(reactionGroups);

          function handleReact(emoji: string) {
            if (!profileId) return;
            toggleReaction({ messageId: item.id, profileId, emoji }).then(() =>
              reexecute({ requestPolicy: "network-only" })
            );
          }

          function showEmojiPicker() {
            const actions: { text: string; onPress?: () => void; style?: "cancel" }[] = REACTION_EMOJIS.map((e) => ({ text: e, onPress: () => handleReact(e) }));
            actions.push({ text: "Cancel", style: "cancel" });
            Alert.alert("Add Reaction", undefined, actions);
          }

          return (
            <View className="flex-row gap-2.5 items-start">
              <View className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 justify-center items-center">
                <Text className="text-sm font-bold text-blue-600">
                  {item.fromProfile.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View className="flex-1">
                <View className="flex-1 gap-1">
                  <View className="flex-row items-baseline gap-2">
                    <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100">{item.fromProfile.displayName}</Text>
                    <Text className="text-xs text-gray-400 dark:text-slate-500">{formatRelativeTime(item.createdAt)}</Text>
                  </View>
                  <SimpleMarkdown content={item.content} />
                </View>
                {(reactionList.length > 0 || true) && (
                  <View className="flex-row flex-wrap gap-1 mt-1 pl-0.5">
                    {reactionList.map((r) => (
                      <TouchableOpacity
                        key={r.emoji}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: r.iMine ? "#dbeafe" : "#f3f4f6",
                          borderRadius: 12,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          gap: 3,
                          borderWidth: r.iMine ? 1 : 0,
                          borderColor: r.iMine ? "#93c5fd" : "transparent",
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 12 }}>{r.emoji}</Text>
                        <Text style={{ fontSize: 11, color: r.iMine ? "#2563eb" : "#6b7280", fontWeight: "600" }}>
                          {r.count}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      onPress={showEmojiPicker}
                      className="bg-gray-100 dark:bg-slate-700 rounded-xl px-2 py-0.5"
                      activeOpacity={0.7}
                    >
                      <Text className="text-xs text-gray-400 dark:text-slate-500">+</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />
      <View
        className="flex-row pt-3 px-3 gap-2 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 items-end"
        style={{ paddingBottom: insets.bottom + 8 }}
      >
        <MentionInput
          className="flex-1 bg-gray-100 dark:bg-slate-700 rounded-full px-3.5 py-2 text-base text-gray-900 dark:text-slate-100 max-h-24"
          placeholder="Write a message…"
          placeholderTextColor="#9ca3af"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          suggestionsAbove
        />
        <TouchableOpacity
          className={`rounded-full px-4 py-2 ${!text.trim() ? "bg-blue-300" : "bg-blue-600"}`}
          onPress={handleSend}
          disabled={!text.trim()}
          activeOpacity={0.7}
        >
          <Text className="text-white font-semibold text-sm">Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

interface ChildTaskDeliverableGroup {
  task: { id: string; title: string; taskNumber: number; status: string };
  deliverables: (Deliverable & { profile: { displayName: string } })[];
}

function DeliverablesTab({ taskId }: { taskId: string }) {
  const router = useRouter();

  const [result] = useQuery<{ deliverablesByTask: Deliverable[] }>({
    query: DELIVERABLES_BY_TASK_QUERY,
    variables: { taskId },
    requestPolicy: "cache-and-network",
  });

  const [childResult] = useQuery<{ deliverablesByChildTasks: ChildTaskDeliverableGroup[] }>({
    query: DELIVERABLES_BY_CHILD_TASKS_QUERY,
    variables: { parentTaskId: taskId },
    requestPolicy: "cache-and-network",
  });

  const deliverables = result.data?.deliverablesByTask ?? [];
  const childGroups = (childResult.data?.deliverablesByChildTasks ?? []).filter(
    (g) => g.deliverables.length > 0,
  );

  if (result.fetching && deliverables.length === 0) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900">
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  if (deliverables.length === 0 && childGroups.length === 0) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900">
        <Text className="text-base text-gray-400 dark:text-slate-500 text-center">No deliverables yet</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {deliverables.map((d) => (
        <TouchableOpacity
          key={d.id}
          className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 flex-row items-center gap-3"
          onPress={() => router.push(`/deliverable/${d.id}`)}
          activeOpacity={0.7}
        >
          <View className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-700 justify-center items-center">
            <Text style={{ fontSize: 20 }}>{KIND_ICONS[d.kind] ?? "📄"}</Text>
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100" numberOfLines={1}>
              {d.title}
            </Text>
            <Text className="text-xs text-gray-500 dark:text-slate-400 capitalize">
              {d.kind} · v{d.version} · {d.profile.displayName}
            </Text>
            <Text className="text-xs text-gray-400 dark:text-slate-500">{formatDate(d.createdAt)}</Text>
          </View>
          <Text className="text-xl text-gray-300 dark:text-slate-600">›</Text>
        </TouchableOpacity>
      ))}

      {childGroups.map((group) => (
        <View key={group.task.id}>
          <View className="flex-row items-center gap-2 py-2 px-1 mt-2">
            <View style={{ backgroundColor: STATUS_HEX_COLORS[group.task.status] ?? DEFAULT_COLOR, width: 8, height: 8, borderRadius: 4 }} />
            <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300 flex-1" numberOfLines={1}>
              #{group.task.taskNumber} {group.task.title}
            </Text>
          </View>
          {group.deliverables.map((d) => (
            <TouchableOpacity
              key={d.id}
              className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 flex-row items-center gap-3 ml-3"
              onPress={() => router.push(`/deliverable/${d.id}`)}
              activeOpacity={0.7}
            >
              <View className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-700 justify-center items-center">
                <Text style={{ fontSize: 20 }}>{KIND_ICONS[d.kind] ?? "📄"}</Text>
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100" numberOfLines={1}>{d.title}</Text>
                <Text className="text-xs text-gray-500 dark:text-slate-400 capitalize">
                  {d.kind} · v{d.version} · {d.profile.displayName}
                </Text>
                <Text className="text-xs text-gray-400 dark:text-slate-500">{formatDate(d.createdAt)}</Text>
              </View>
              <Text className="text-xl text-gray-300 dark:text-slate-600">›</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

// ── Approve / Reject bar ──────────────────────────────────────────────────────

function ApproveRejectBar({
  task,
  onDone,
}: {
  task: Task;
  onDone: () => void;
}) {
  const { profileId } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState<"approve" | "reject" | "clarify" | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showClarifyModal, setShowClarifyModal] = useState(false);
  const [, requestClarification] = useMutation(REQUEST_CLARIFICATION);
  const [, approveTask] = useMutation(APPROVE_TASK);
  const [, rejectTask] = useMutation(REJECT_TASK);

  async function doApprove(
    comment: string,
    childTasks: Array<{ title: string; description?: string }>,
  ) {
    if (!profileId) return;
    setShowApproveModal(false);
    setLoading("approve");
    try {
      const res = await approveTask({
        reviewerId: profileId,
        taskId: task.id,
        approvalComment: comment || undefined,
        childTasks: childTasks.length ? JSON.stringify(childTasks) : undefined,
      });
      if (res.error) Alert.alert("Error", res.error.message ?? "Failed to approve");
      else onDone();
    } finally {
      setLoading(null);
    }
  }

  async function doClarify(questions: string[]) {
    if (!profileId) return;
    setShowClarifyModal(false);
    setLoading("clarify");
    try {
      const res = await requestClarification({ reviewerId: profileId, taskId: task.id, questions });
      if (res.error) Alert.alert("Error", res.error.message ?? "Failed to request clarification");
      else onDone();
    } finally {
      setLoading(null);
    }
  }

  async function doReject(reason: string, changes: string[]) {
    if (!profileId) return;
    setShowRejectModal(false);
    setLoading("reject");
    try {
      const res = await rejectTask({
        reviewerId: profileId,
        taskId: task.id,
        rejectionReason: reason,
        changesNeeded: changes,
      });
      if (res.error) Alert.alert("Error", res.error.message ?? "Failed to reject");
      else onDone();
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <View
        className="bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 px-4 pt-3 gap-2.5"
        style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }}
      >
        <Text className="text-xs font-bold text-violet-700 uppercase tracking-[0.5px] text-center">Awaiting Review</Text>
        <View className="flex-row gap-2.5">
          <TouchableOpacity
            className={`flex-1 py-3 rounded-xl border-2 border-violet-700 items-center justify-center ${loading !== null ? "opacity-60" : ""}`}
            onPress={() => setShowClarifyModal(true)}
            disabled={loading !== null}
          >
            {loading === "clarify" ? (
              <ActivityIndicator size="small" color="#7c3aed" />
            ) : (
              <Text className="text-violet-700 font-bold text-base">? Clarify</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 py-3 rounded-xl border-2 border-red-600 items-center justify-center ${loading !== null ? "opacity-60" : ""}`}
            onPress={() => setShowRejectModal(true)}
            disabled={loading !== null}
          >
            {loading === "reject" ? (
              <ActivityIndicator size="small" color="#dc2626" />
            ) : (
              <Text className="text-red-600 font-bold text-base">✕ Reject</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 py-3 rounded-xl bg-green-600 items-center justify-center ${loading !== null ? "opacity-60" : ""}`}
            onPress={() => setShowApproveModal(true)}
            disabled={loading !== null}
          >
            {loading === "approve" ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-white font-bold text-base">✓ Approve</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
      <ApproveModal
        visible={showApproveModal}
        onClose={() => setShowApproveModal(false)}
        onConfirm={doApprove}
      />
      <RejectModal
        visible={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        onConfirm={doReject}
      />
      <ClarifyModal
        visible={showClarifyModal}
        onClose={() => setShowClarifyModal(false)}
        onConfirm={doClarify}
      />
    </>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(0);
  const { profileId } = useAuth();
  const { colors } = useTheme();

  // Notifications use task numbers (e.g. /task/42). Detect and resolve to db id.
  const taskNumber = /^\d+$/.test(id ?? "") ? parseInt(id, 10) : null;

  // Numeric id (from notification URLs like /task/42): resolve via taskByNumber and render
  // directly — no redirect, so only one query and one loading state.
  const [byNumberResult] = useQuery<{ taskByNumber: Task | null }>({
    query: TASK_BY_NUMBER_QUERY,
    variables: { taskNumber: taskNumber ?? 0 },
    pause: taskNumber === null,
    requestPolicy: "cache-and-network",
  });

  // Normal cuid route
  const [result, reexecute] = useQuery<{ task: Task | null }>({
    query: TASK_QUERY,
    variables: { id },
    pause: taskNumber !== null, // numeric routes use byNumberResult directly
    requestPolicy: "cache-and-network",
  });

  // Use byNumberResult for numeric routes, TASK_QUERY for normal routes
  const task: Task | null =
    taskNumber !== null
      ? (byNumberResult.data?.taskByNumber ?? null)
      : (result.data?.task ?? null);
  const error = taskNumber !== null ? byNumberResult.error : result.error;

  // Resolved cuid (needed for subscriptions / mutations on numeric routes)
  const resolvedId = task?.id ?? id;

  // Subscribe to live task updates (status changes)
  const [taskSub] = useSubscription<{ taskUpdated: { id: string; status: string } }>({
    query: ON_TASK_UPDATED,
    variables: { taskId: resolvedId },
  });
  useEffect(() => {
    if (taskSub.data) reexecute({ requestPolicy: "network-only" });
  }, [taskSub.data]);

  const [, executeUpdate] = useMutation(UPDATE_TASK);
  const [, saveAsTemplate] = useMutation(SAVE_TASK_AS_TEMPLATE);

  const [agentsResult] = useQuery<{ agents: { id: string; name: string; identityEmoji: string; currentTaskId: string | null }[] }>({
    query: AGENTS_FOR_TASK_QUERY,
    requestPolicy: "cache-only",
    pause: !task,
  });
  const workingAgents = (agentsResult.data?.agents ?? []).filter((a) => a.currentTaskId === resolvedId);

  const handleMoreActions = (taskId: string) => {
    Alert.alert("Task Actions", undefined, [
      {
        text: "Save as Template",
        onPress: async () => {
          const res = await saveAsTemplate({ taskId });
          if (res.error) Alert.alert("Error", res.error.message ?? "Failed to save as template");
          else Alert.alert("Saved", "Task saved as a reusable template.");
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  useEffect(() => {
    if (task) {
      navigation.setOptions({
        title: `#${task.taskNumber} · ${task.title.slice(0, 30)}`,
        headerRight: () => (
          <View className="flex-row items-center gap-1">
            <TouchableOpacity
              onPress={() => router.push(`/task/edit?id=${task.id}` as Parameters<typeof router.push>[0])}
              className="px-2 py-1"
              activeOpacity={0.7}
            >
              <Text style={{ color: colors.accent }} className="text-base font-semibold">Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleMoreActions(task.id)}
              className="px-2 py-1"
              activeOpacity={0.7}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.icon} />
            </TouchableOpacity>
          </View>
        ),
      });
    }
  }, [task, navigation, router]);

  const handleStatusChange = () => {
    if (!task) return;
    Alert.alert(
      "Change Status",
      undefined,
      [
        ...TASK_STATUSES.map((s) => ({
          text: s.label,
          onPress: async () => {
            const res = await executeUpdate({ id: task.id, status: s.id });
            if (res.error) Alert.alert("Error", "Failed to update status");
            else reexecute({ requestPolicy: "network-only" });
          },
        })),
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  if (!task) {
    if (error) {
      return (
        <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900">
          <Text className="text-red-600 text-base">Task not found</Text>
        </View>
      );
    }
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900 gap-3">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="text-sm text-gray-400 dark:text-slate-500">Loading task…</Text>
      </View>
    );
  }

  const showApproveReject = task.status === "review";

  return (
    <View className="flex-1 bg-gray-50 dark:bg-slate-900">
      <TabBar
        tabs={["Overview", "Messages", "Deliverables"]}
        active={activeTab}
        onPress={setActiveTab}
      />
      {workingAgents.length > 0 && (
        <View className="flex-row items-center px-3 py-1.5 bg-amber-50 border-b border-amber-200 gap-1">
          <Text className="text-xs">⚡</Text>
          <Text className="text-xs text-amber-800 flex-1 font-medium" numberOfLines={1}>
            {workingAgents.map((a) => `${a.identityEmoji ?? DEFAULT_AGENT_EMOJI} ${a.name}`).join("  ·  ")}
          </Text>
          <Text className="text-xs text-amber-800 font-semibold"> working</Text>
        </View>
      )}
      <View className="flex-1">
        {activeTab === 0 && (
          <OverviewTab
            task={task}
            onStatusChange={handleStatusChange}
            onProjectAssign={async (projectId) => {
              const res = await executeUpdate({ id: task.id, projectId });
              if (res.error) Alert.alert("Error", "Failed to assign project");
              else reexecute({ requestPolicy: "network-only" });
            }}
          />
        )}
        {activeTab === 1 && (
          <MessagesTab taskId={task.id} profileId={profileId} />
        )}
        {activeTab === 2 && (
          <DeliverablesTab taskId={task.id} />
        )}
      </View>
      {showApproveReject && (
        <ApproveRejectBar
          task={task}
          onDone={() => reexecute({ requestPolicy: "network-only" })}
        />
      )}
    </View>
  );
}
