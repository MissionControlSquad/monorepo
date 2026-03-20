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
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useQuery, useMutation } from "urql";
import { useState, useEffect, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  TASK_QUERY,
  MESSAGES_BY_TASK_QUERY,
  DELIVERABLES_BY_TASK_QUERY,
} from "@agentcenter/graphql-client";
import { UPDATE_TASK, CREATE_MESSAGE } from "@agentcenter/graphql-client";
import { useAuth } from "../../src/context/AuthContext";

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
  project: { id: string; name: string } | null;
  assignees: TaskAssignee[];
}

interface Message {
  id: string;
  taskId: string;
  fromProfileId: string;
  content: string;
  createdAt: string;
  fromProfile: Profile;
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

const TASK_STATUSES = ["inbox", "assigned", "in_progress", "review", "done", "blocked"];

const STATUS_COLORS: Record<string, string> = {
  inbox: "#6b7280",
  assigned: "#2563eb",
  in_progress: "#d97706",
  review: "#7c3aed",
  done: "#16a34a",
  blocked: "#dc2626",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#6b7280",
  medium: "#d97706",
  high: "#dc2626",
  urgent: "#7c3aed",
};

const KIND_ICONS: Record<string, string> = {
  markdown: "📄",
  code: "💻",
  link: "🔗",
  file: "📎",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function statusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

function OverviewTab({ task, onStatusChange }: { task: Task; onStatusChange: () => void }) {
  const statusColor = STATUS_COLORS[task.status] ?? "#6b7280";
  return (
    <ScrollView
      contentContainerStyle={styles.tabContent}
      contentInsetAdjustmentBehavior="automatic"
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
            {statusLabel(task.status)}
          </Text>
        </TouchableOpacity>
        {task.priority && (
          <View
            style={[
              styles.badge,
              { backgroundColor: (PRIORITY_COLORS[task.priority] ?? "#6b7280") + "22" },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: PRIORITY_COLORS[task.priority] ?? "#6b7280", textTransform: "capitalize" },
              ]}
            >
              {task.priority}
            </Text>
          </View>
        )}
        {task.project && (
          <View style={[styles.badge, { backgroundColor: "#f3f4f6" }]}>
            <Text style={[styles.badgeText, { color: "#6b7280" }]}>📁 {task.project.name}</Text>
          </View>
        )}
      </View>

      {/* Description */}
      {task.description ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Description</Text>
          <Text style={styles.description}>{task.description}</Text>
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
                  <Text style={styles.assigneeStatus}>{statusLabel(a.profile.agent.status)}</Text>
                )}
              </View>
            </View>
          ))}
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
          <DetailRow
            label="Parent Task"
            value={`#${task.parentTask.taskNumber} ${task.parentTask.title}`}
          />
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

function MessagesTab({ taskId, profileId }: { taskId: string; profileId: string | null }) {
  const [text, setText] = useState("");
  const listRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();

  const [result, reexecute] = useQuery<{ messagesByTask: Message[] }>({
    query: MESSAGES_BY_TASK_QUERY,
    variables: { taskId },
    requestPolicy: "cache-and-network",
  });

  const [, sendMessage] = useMutation(CREATE_MESSAGE);

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
        renderItem={({ item }) => (
          <View style={styles.messageRow}>
            <View style={styles.messageAvatar}>
              <Text style={styles.messageAvatarText}>
                {item.fromProfile.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.messageBubble}>
              <View style={styles.messageHeader}>
                <Text style={styles.messageSender}>{item.fromProfile.displayName}</Text>
                <Text style={styles.messageTime}>{formatTime(item.createdAt)}</Text>
              </View>
              <Text style={styles.messageContent}>{item.content}</Text>
            </View>
          </View>
        )}
      />
      <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.messageInput}
          placeholder="Write a message…"
          placeholderTextColor="#9ca3af"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
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

function DeliverablesTab({ taskId }: { taskId: string }) {
  const router = useRouter();

  const [result] = useQuery<{ deliverablesByTask: Deliverable[] }>({
    query: DELIVERABLES_BY_TASK_QUERY,
    variables: { taskId },
    requestPolicy: "cache-and-network",
  });

  const deliverables = result.data?.deliverablesByTask ?? [];

  if (result.fetching && deliverables.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  if (deliverables.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No deliverables yet</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.tabContent}
      contentInsetAdjustmentBehavior="automatic"
    >
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
    </ScrollView>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState(0);
  const { profileId } = useAuth();

  const [result, reexecute] = useQuery<{ task: Task | null }>({
    query: TASK_QUERY,
    variables: { id },
    requestPolicy: "cache-and-network",
  });

  const [, executeUpdate] = useMutation(UPDATE_TASK);
  const { data, fetching, error } = result;
  const task = data?.task;

  useEffect(() => {
    if (task) navigation.setOptions({ title: `#${task.taskNumber} · ${task.title.slice(0, 30)}` });
  }, [task, navigation]);

  const handleStatusChange = () => {
    if (!task) return;
    Alert.alert(
      "Change Status",
      undefined,
      [
        ...TASK_STATUSES.map((s) => ({
          text: statusLabel(s),
          onPress: async () => {
            const res = await executeUpdate({ id: task.id, status: s });
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

  return (
    <View style={{ flex: 1, backgroundColor: "#f9fafb" }}>
      <TabBar
        tabs={["Overview", "Messages", "Deliverables"]}
        active={activeTab}
        onPress={setActiveTab}
      />
      {activeTab === 0 && (
        <OverviewTab task={task} onStatusChange={handleStatusChange} />
      )}
      {activeTab === 1 && (
        <MessagesTab taskId={task.id} profileId={profileId} />
      )}
      {activeTab === 2 && (
        <DeliverablesTab taskId={task.id} />
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
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
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
});
