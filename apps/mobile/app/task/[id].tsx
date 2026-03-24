import {
  View,
  Text,
  ScrollView,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useQuery, useMutation, useSubscription } from "urql";
import { useState, useEffect, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  TASK_QUERY,
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
import { STATUS_HEX_COLORS, PRIORITY_HEX_COLORS, TASK_STATUSES, DEFAULT_COLOR, DEFAULT_AGENT_EMOJI, formatRelativeTime, formatDate, humanizeLabel, DELIVERABLE_KIND_HEX_COLORS, DELIVERABLE_KIND_ICONS } from "@agentcenter/utils";
import { useAuth } from "../../src/context/AuthContext";
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
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Reject Task</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Text style={{ fontSize: 22, color: "#374151" }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text style={styles.rejectLabel}>Rejection Reason *</Text>
              <TextInput
                style={[styles.rejectInput, { height: 80 }]}
                value={reason}
                onChangeText={setReason}
                placeholder="Why is this being rejected?"
                multiline
                textAlignVertical="top"
              />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={styles.rejectLabel}>Changes Needed</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  style={[styles.rejectInput, { flex: 1 }]}
                  value={changeText}
                  onChangeText={setChangeText}
                  placeholder="Add a required change"
                  returnKeyType="done"
                  onSubmitEditing={addChange}
                />
                <TouchableOpacity style={styles.addChangeBtn} onPress={addChange}>
                  <Text style={styles.addChangeBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
              {changes.map((c, i) => (
                <View key={i} style={styles.changeItem}>
                  <Text style={styles.changeText} numberOfLines={2}>• {c}</Text>
                  <TouchableOpacity onPress={() => removeChange(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ color: "#dc2626", fontSize: 16 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.rejectConfirmBtn} onPress={handleConfirm}>
              <Text style={styles.rejectConfirmBtnText}>Reject Task</Text>
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
    <View style={styles.tabBar}>
      {tabs.map((tab, i) => (
        <TouchableOpacity
          key={tab}
          style={[styles.tab, active === i && styles.tabActive]}
          onPress={() => onPress(i)}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, active === i && styles.tabTextActive]}>{tab}</Text>
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

function fmtDuration(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
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
      contentContainerStyle={styles.tabContent}
    >
      {/* Title */}
      <Text style={styles.title}>{task.title}</Text>

      {/* Badges */}
      <View style={styles.badgeRow}>
        <TouchableOpacity
          style={[styles.badge, { backgroundColor: statusColor + "22" }]}
          onPress={onStatusChange}
          activeOpacity={0.7}
        >
          <Text style={[styles.badgeText, { color: statusColor }]}>
            {humanizeLabel(task.status)}
          </Text>
        </TouchableOpacity>
        {task.priority && (
          <View
            style={[
              styles.badge,
              { backgroundColor: (PRIORITY_HEX_COLORS[task.priority] ?? DEFAULT_COLOR) + "22" },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: PRIORITY_HEX_COLORS[task.priority] ?? DEFAULT_COLOR, textTransform: "capitalize" },
              ]}
            >
              {task.priority}
            </Text>
          </View>
        )}
        {task.project ? (
          <TouchableOpacity
            style={[styles.badge, { backgroundColor: "#f3f4f6" }]}
            onPress={() => router.push(`/project/${task.project!.id}`)}
          >
            <Text style={[styles.badgeText, { color: "#6b7280" }]}>📁 {task.project.name}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.badge, { backgroundColor: "#f3f4f6", borderStyle: "dashed", borderWidth: 1, borderColor: "#d1d5db" }]}
            onPress={handleAssignProject}
            activeOpacity={0.7}
          >
            <Text style={[styles.badgeText, { color: "#9ca3af" }]}>📁 Assign project</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Blocked-by dependency */}
      {task.blockedByTask && (
        <TouchableOpacity
          style={styles.blockedByCard}
          onPress={() => router.push(`/task/${task.blockedByTask!.id}`)}
          activeOpacity={0.8}
        >
          <Text style={styles.blockedByLabel}>🚫 Blocked by</Text>
          <View style={styles.blockedByRow}>
            <Text style={styles.blockedByTaskNum}>#{task.blockedByTask.taskNumber}</Text>
            <Text style={styles.blockedByTaskTitle} numberOfLines={1}>
              {task.blockedByTask.title}
            </Text>
            <View
              style={[
                styles.miniPill,
                { backgroundColor: (STATUS_HEX_COLORS[task.blockedByTask.status] ?? DEFAULT_COLOR) + "22" },
              ]}
            >
              <Text
                style={[
                  styles.miniPillText,
                  { color: STATUS_HEX_COLORS[task.blockedByTask.status] ?? DEFAULT_COLOR },
                ]}
              >
                {task.blockedByTask.status.replace("_", " ")}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* Description */}
      {task.description ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Description</Text>
          <SimpleMarkdown content={task.description} />
        </View>
      ) : null}

      {/* Assignees */}
      {task.assignees.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Assignees</Text>
          {task.assignees.map((a) => (
            <View key={a.id} style={styles.assigneeRow}>
              <Text style={styles.assigneeEmoji}>
                {a.profile.agent?.identityEmoji ?? "👤"}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.assigneeName}>{a.profile.displayName}</Text>
                {a.profile.agent && (
                  <Text style={styles.assigneeStatus}>{humanizeLabel(a.profile.agent.status)}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Subtasks */}
      {(childTasks.length > 0 || childResult.fetching) && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Subtasks ({childTasks.length})</Text>
          {childResult.fetching ? (
            <ActivityIndicator size="small" color="#2563eb" />
          ) : (
            childTasks.map((ct) => (
              <TouchableOpacity
                key={ct.id}
                style={styles.subtaskRow}
                onPress={() => router.push(`/task/${ct.id}`)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.subtaskDot,
                    { backgroundColor: STATUS_HEX_COLORS[ct.status] ?? DEFAULT_COLOR },
                  ]}
                />
                <Text style={styles.subtaskNum}>#{ct.taskNumber}</Text>
                <Text style={styles.subtaskTitle} numberOfLines={1}>
                  {ct.title}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      {/* Details */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Details</Text>
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
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Tags</Text>
          <View style={styles.tagsRow}>
            {task.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Work time */}
      {workSummary && workSummary.totalWorkTimeMs > 0 && (
        <View style={styles.card}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.cardLabel}>Work Time</Text>
            {workSummary.activeSessionCount > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#16a34a" }} />
                <Text style={{ fontSize: 11, color: "#16a34a", fontWeight: "600" }}>
                  {workSummary.activeSessionCount} active
                </Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 22, fontWeight: "700", color: "#111827", marginTop: 4 }}>
            {fmtDuration(workSummary.totalWorkTimeMs)}
          </Text>
          {workSummary.agentBreakdown.map((ab) => (
            <View key={ab.agentId} style={styles.detailRow}>
              <Text style={styles.detailKey} numberOfLines={1}>{ab.agentName}</Text>
              <Text style={styles.detailValue}>{fmtDuration(ab.totalMs)}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailKey}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
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
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 + insets.bottom : 0}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={[
          styles.messagesList,
          messages.length === 0 && styles.messagesEmpty,
        ]}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No messages yet. Start the conversation.</Text>
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
            <View style={styles.messageRow}>
              <View style={styles.messageAvatar}>
                <Text style={styles.messageAvatarText}>
                  {item.fromProfile.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.messageBubble}>
                  <View style={styles.messageHeader}>
                    <Text style={styles.messageSender}>{item.fromProfile.displayName}</Text>
                    <Text style={styles.messageTime}>{formatRelativeTime(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.messageContent}>{item.content}</Text>
                </View>
                {(reactionList.length > 0 || true) && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4, paddingLeft: 2 }}>
                    {reactionList.map((r) => (
                      <TouchableOpacity
                        key={r.emoji}
                        onPress={() => handleReact(r.emoji)}
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
                      style={{ backgroundColor: "#f3f4f6", borderRadius: 12, paddingHorizontal: 7, paddingVertical: 2 }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 12, color: "#9ca3af" }}>+</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />
      <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
        <MentionInput
          style={styles.messageInput}
          placeholder="Write a message…"
          placeholderTextColor="#9ca3af"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          suggestionsAbove
        />
        <TouchableOpacity
          style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim()}
          activeOpacity={0.7}
        >
          <Text style={styles.sendBtnText}>Send</Text>
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
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  if (deliverables.length === 0 && childGroups.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No deliverables yet</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {deliverables.map((d) => (
        <TouchableOpacity
          key={d.id}
          style={styles.deliverableCard}
          onPress={() => router.push(`/deliverable/${d.id}`)}
          activeOpacity={0.7}
        >
          <View style={styles.deliverableIcon}>
            <Text style={{ fontSize: 20 }}>{KIND_ICONS[d.kind] ?? "📄"}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.deliverableTitle} numberOfLines={1}>
              {d.title}
            </Text>
            <Text style={styles.deliverableMeta}>
              {d.kind} · v{d.version} · {d.profile.displayName}
            </Text>
            <Text style={styles.deliverableTime}>{formatDate(d.createdAt)}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ))}

      {childGroups.map((group) => (
        <View key={group.task.id}>
          <View style={styles.childGroupHeader}>
            <View style={[styles.subtaskDot, { backgroundColor: STATUS_HEX_COLORS[group.task.status] ?? DEFAULT_COLOR }]} />
            <Text style={styles.childGroupTitle} numberOfLines={1}>
              #{group.task.taskNumber} {group.task.title}
            </Text>
          </View>
          {group.deliverables.map((d) => (
            <TouchableOpacity
              key={d.id}
              style={[styles.deliverableCard, { marginLeft: 12 }]}
              onPress={() => router.push(`/deliverable/${d.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.deliverableIcon}>
                <Text style={{ fontSize: 20 }}>{KIND_ICONS[d.kind] ?? "📄"}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.deliverableTitle} numberOfLines={1}>{d.title}</Text>
                <Text style={styles.deliverableMeta}>
                  {d.kind} · v{d.version} · {d.profile.displayName}
                </Text>
                <Text style={styles.deliverableTime}>{formatDate(d.createdAt)}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
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
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [, requestClarification] = useMutation(REQUEST_CLARIFICATION);
  const [, approveTask] = useMutation(APPROVE_TASK);
  const [, rejectTask] = useMutation(REJECT_TASK);

  async function handleApprove() {
    Alert.alert("Approve Task", "Add an optional approval comment?", [
      {
        text: "Approve without comment",
        onPress: () => doApprove(""),
      },
      {
        text: "Add Comment",
        onPress: () => {
          Alert.prompt(
            "Approval Comment",
            "Optional comment",
            (comment) => doApprove(comment ?? ""),
            "plain-text"
          );
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function doApprove(comment: string) {
    if (!profileId) return;
    setLoading("approve");
    try {
      const res = await approveTask({
        reviewerId: profileId,
        taskId: task.id,
        approvalComment: comment || undefined,
      });
      if (res.error) Alert.alert("Error", res.error.message ?? "Failed to approve");
      else onDone();
    } finally {
      setLoading(null);
    }
  }

  async function handleClarify() {
    Alert.prompt("Request Clarification", "What questions do you have? (separate multiple with newlines)", async (input) => {
      if (!input?.trim() || !profileId) return;
      const questions = input.split("\n").map((q) => q.trim()).filter(Boolean);
      setLoading("clarify");
      try {
        const res = await requestClarification({ reviewerId: profileId, taskId: task.id, questions });
        if (res.error) Alert.alert("Error", res.error.message ?? "Failed to request clarification");
        else onDone();
      } finally {
        setLoading(null);
      }
    }, "plain-text");
  }

  async function doReject(reason: string, changes: string[]) {
    if (!profileId) return;
    setLoading("reject");
    setShowRejectModal(false);
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
        style={[
          styles.approveRejectBar,
          { paddingBottom: insets.bottom > 0 ? insets.bottom : 16 },
        ]}
      >
        <Text style={styles.reviewLabel}>Awaiting Review</Text>
        <View style={styles.approveRejectBtns}>
          <TouchableOpacity
            style={[styles.clarifyBtn, loading !== null && { opacity: 0.6 }]}
            onPress={handleClarify}
            disabled={loading !== null}
          >
            {loading === "clarify" ? (
              <ActivityIndicator size="small" color="#7c3aed" />
            ) : (
              <Text style={styles.clarifyBtnText}>? Clarify</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rejectBtn, loading !== null && { opacity: 0.6 }]}
            onPress={() => setShowRejectModal(true)}
            disabled={loading !== null}
          >
            {loading === "reject" ? (
              <ActivityIndicator size="small" color="#dc2626" />
            ) : (
              <Text style={styles.rejectBtnText}>✕ Reject</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.approveBtn, loading !== null && { opacity: 0.6 }]}
            onPress={handleApprove}
            disabled={loading !== null}
          >
            {loading === "approve" ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.approveBtnText}>✓ Approve</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
      <RejectModal
        visible={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        onConfirm={doReject}
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

  const [result, reexecute] = useQuery<{ task: Task | null }>({
    query: TASK_QUERY,
    variables: { id },
    requestPolicy: "cache-and-network",
  });

  // Subscribe to live task updates (status changes)
  const [taskSub] = useSubscription<{ taskUpdated: { id: string; status: string } }>({
    query: ON_TASK_UPDATED,
    variables: { taskId: id },
  });
  useEffect(() => {
    if (taskSub.data) reexecute({ requestPolicy: "network-only" });
  }, [taskSub.data]);

  const [, executeUpdate] = useMutation(UPDATE_TASK);
  const [, saveAsTemplate] = useMutation(SAVE_TASK_AS_TEMPLATE);
  const { data, fetching, error } = result;
  const task = data?.task;

  const [agentsResult] = useQuery<{ agents: { id: string; name: string; identityEmoji: string; currentTaskId: string | null }[] }>({
    query: AGENTS_FOR_TASK_QUERY,
    requestPolicy: "cache-only",
    pause: !task,
  });
  const workingAgents = (agentsResult.data?.agents ?? []).filter((a) => a.currentTaskId === id);

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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <TouchableOpacity
              onPress={() => router.push(`/task/edit?id=${task.id}` as Parameters<typeof router.push>[0])}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: "#2563eb" }}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleMoreActions(task.id)}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 22, color: "#6b7280", lineHeight: 24 }}>•••</Text>
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

  if (fetching && !task) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if ((error && !task) || !task) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Task not found</Text>
      </View>
    );
  }

  const showApproveReject = task.status === "review";

  return (
    <View style={{ flex: 1, backgroundColor: "#f9fafb" }}>
      <TabBar
        tabs={["Overview", "Messages", "Deliverables"]}
        active={activeTab}
        onPress={setActiveTab}
      />
      {workingAgents.length > 0 && (
        <View style={styles.workingAgentsBar}>
          <Text style={styles.workingAgentsBolt}>⚡</Text>
          <Text style={styles.workingAgentsText} numberOfLines={1}>
            {workingAgents.map((a) => `${a.identityEmoji ?? DEFAULT_AGENT_EMOJI} ${a.name}`).join("  ·  ")}
          </Text>
          <Text style={styles.workingAgentsLabel}> working</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
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

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  errorText: { color: "#dc2626", fontSize: 16 },
  emptyText: { color: "#9ca3af", fontSize: 15, textAlign: "center" },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    minHeight: 46,
  },
  tab: {
    flex: 1,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#2563eb",
  },
  tabText: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  tabTextActive: {
    color: "#2563eb",
    fontWeight: "600",
  },

  // Overview
  tabContent: {
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 28,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 10,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  description: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
  },

  // Blocked-by
  blockedByCard: {
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    gap: 6,
  },
  blockedByLabel: { fontSize: 12, fontWeight: "700", color: "#dc2626" },
  blockedByRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  blockedByTaskNum: { fontSize: 12, color: "#9ca3af", fontWeight: "500" },
  blockedByTaskTitle: { fontSize: 13, color: "#111827", flex: 1, fontWeight: "500" },
  miniPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  miniPillText: { fontSize: 10, fontWeight: "600", textTransform: "capitalize" },

  // Subtasks
  childGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  childGroupTitle: { fontSize: 13, fontWeight: "600", color: "#374151", flex: 1 },
  subtaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  subtaskDot: { width: 8, height: 8, borderRadius: 4 },
  subtaskNum: { fontSize: 12, color: "#9ca3af", fontWeight: "500", width: 32 },
  subtaskTitle: { fontSize: 13, color: "#374151", flex: 1 },

  assigneeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  assigneeEmoji: { fontSize: 20 },
  assigneeName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  assigneeStatus: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 1,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  detailKey: {
    fontSize: 14,
    color: "#6b7280",
    width: 100,
  },
  detailValue: {
    fontSize: 14,
    color: "#111827",
    flex: 1,
    textAlign: "right",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    backgroundColor: "#eff6ff",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 12,
    color: "#2563eb",
    fontWeight: "500",
  },

  // Messages
  messagesList: {
    padding: 16,
    gap: 16,
  },
  messagesEmpty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  messageRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  messageAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
  },
  messageAvatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2563eb",
  },
  messageBubble: {
    flex: 1,
    gap: 4,
  },
  messageHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  messageSender: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  messageTime: {
    fontSize: 11,
    color: "#9ca3af",
  },
  messageContent: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: "row",
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    alignItems: "flex-end",
  },
  messageInput: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    color: "#111827",
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sendBtnDisabled: {
    backgroundColor: "#93c5fd",
  },
  sendBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },

  // Deliverables
  deliverableCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  deliverableIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  deliverableTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  deliverableMeta: {
    fontSize: 12,
    color: "#6b7280",
    textTransform: "capitalize",
  },
  deliverableTime: {
    fontSize: 11,
    color: "#9ca3af",
  },
  chevron: {
    fontSize: 20,
    color: "#d1d5db",
  },

  // Working agents bar
  workingAgentsBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fffbeb",
    borderBottomWidth: 1,
    borderBottomColor: "#fde68a",
    gap: 4,
  },
  workingAgentsBolt: { fontSize: 12 },
  workingAgentsText: { fontSize: 12, color: "#92400e", flex: 1, fontWeight: "500" },
  workingAgentsLabel: { fontSize: 12, color: "#92400e", fontWeight: "600" },

  // Approve/Reject bar
  approveRejectBar: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  reviewLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#7c3aed",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  approveRejectBtns: {
    flexDirection: "row",
    gap: 10,
  },
  clarifyBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
  },
  clarifyBtnText: {
    color: "#7c3aed",
    fontWeight: "700",
    fontSize: 15,
  },
  rejectBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtnText: {
    color: "#dc2626",
    fontWeight: "700",
    fontSize: 15,
  },
  approveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
  },
  approveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },

  // Reject modal
  modalContainer: { flex: 1, backgroundColor: "#fff" },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },
  rejectLabel: { fontSize: 13, fontWeight: "600", color: "#374151" },
  rejectInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#f9fafb",
  },
  addChangeBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "center",
  },
  addChangeBtnText: { color: "#fff", fontWeight: "600" },
  changeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  changeText: { flex: 1, fontSize: 13, color: "#374151" },
  rejectConfirmBtn: {
    backgroundColor: "#dc2626",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  rejectConfirmBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
