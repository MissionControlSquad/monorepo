import {
  View,
  Text,
  ScrollView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useQuery } from "urql";
import { useEffect, useState } from "react";
import {
  AGENT_QUERY,
  AGENT_PROFILE_STATS_QUERY,
  AGENT_QUEUE_BY_AGENT_QUERY,
  AGENT_STATUS_HISTORY_QUERY,
} from "@agentcenter/graphql-client";

interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  detailedStatus: string | null;
  statusMessage: string | null;
  currentTaskId: string | null;
  currentTask: string | null;
  identityEmoji: string | null;
  level: string;
  username: string;
  lastHeartbeat: string | null;
  setupStatus: string | null;
  isOnVacation: boolean;
  personality: string | null;
  workspacePath: string | null;
  hostingType: string | null;
  createdAt: string;
  currentTaskRef: { id: string; title: string; taskNumber: number; status: string } | null;
}

interface AgentStats {
  tasksAssigned: number;
  tasksCompleted: number;
  deliverablesCount: number;
  totalWorkTimeMs: number;
  queueCompletionRate: number;
}

interface QueueItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  itemType: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  relatedTask: { id: string; title: string; taskNumber: number; status: string } | null;
}

interface StatusHistory {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  fromDetailedStatus: string | null;
  toDetailedStatus: string | null;
  statusMessage: string | null;
  timestamp: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "#16a34a",
  idle: "#6b7280",
  blocked: "#dc2626",
};

const QUEUE_STATUS_COLORS: Record<string, string> = {
  pending: "#6b7280",
  in_progress: "#d97706",
  completed: "#16a34a",
  cancelled: "#dc2626",
  blocked: "#7c3aed",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#6b7280",
  medium: "#d97706",
  high: "#dc2626",
  urgent: "#7c3aed",
};

type Tab = "overview" | "queue" | "history";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function isOnline(lastHeartbeat: string | null): boolean {
  if (!lastHeartbeat) return false;
  return new Date(lastHeartbeat).getTime() > Date.now() - 2 * 60 * 1000;
}

function label(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AgentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const [agentResult] = useQuery<{ agent: Agent | null }>({
    query: AGENT_QUERY,
    variables: { id },
    requestPolicy: "cache-and-network",
  });

  const [statsResult] = useQuery<{ agentProfileStats: AgentStats | null }>({
    query: AGENT_PROFILE_STATS_QUERY,
    variables: { agentId: id },
    requestPolicy: "cache-and-network",
  });

  const [queueResult, reexecuteQueue] = useQuery<{ agentQueueByAgent: QueueItem[] }>({
    query: AGENT_QUEUE_BY_AGENT_QUERY,
    variables: { agentId: id },
    requestPolicy: "cache-and-network",
    pause: activeTab !== "queue",
  });

  const [historyResult, reexecuteHistory] = useQuery<{ agentStatusHistory: StatusHistory[] }>({
    query: AGENT_STATUS_HISTORY_QUERY,
    variables: { agentId: id, limit: 50 },
    requestPolicy: "cache-and-network",
    pause: activeTab !== "history",
  });

  const agent = agentResult.data?.agent;
  const stats = statsResult.data?.agentProfileStats;

  useEffect(() => {
    if (agent) navigation.setOptions({ title: agent.name });
  }, [agent, navigation]);

  if (agentResult.fetching && !agent) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (agentResult.error || !agent) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Agent not found</Text>
      </View>
    );
  }

  const online = isOnline(agent.lastHeartbeat);
  const statusColor = STATUS_COLORS[agent.status] ?? "#6b7280";

  return (
    <View style={styles.container}>
      {/* Agent Header */}
      <View style={styles.header}>
        <View style={styles.emojiWrapper}>
          <Text style={styles.emoji}>{agent.identityEmoji ?? "🤖"}</Text>
          <View style={[styles.onlineDot, { backgroundColor: online ? statusColor : "#d1d5db" }]} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.agentName}>{agent.name}</Text>
          <Text style={styles.agentRole}>{agent.role}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: (online ? statusColor : "#6b7280") + "22" }]}>
              <Text style={[styles.statusText, { color: online ? statusColor : "#6b7280" }]}>
                {online ? (agent.detailedStatus ? label(agent.detailedStatus) : label(agent.status)) : "Offline"}
              </Text>
            </View>
            {agent.isOnVacation && (
              <View style={[styles.statusBadge, { backgroundColor: "#fef3c7" }]}>
                <Text style={[styles.statusText, { color: "#d97706" }]}>On Vacation</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Stats Row */}
      {stats && (
        <View style={styles.statsRow}>
          <StatCard label="Assigned" value={stats.tasksAssigned} />
          <StatCard label="Completed" value={stats.tasksCompleted} />
          <StatCard label="Deliverables" value={stats.deliverablesCount} />
          <StatCard label="Work Time" value={formatDuration(stats.totalWorkTimeMs)} isText />
        </View>
      )}

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {(["overview", "queue", "history"] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <OverviewTab agent={agent} router={router} />
      )}
      {activeTab === "queue" && (
        <QueueTab
          items={queueResult.data?.agentQueueByAgent ?? []}
          fetching={queueResult.fetching}
          onRefresh={() => reexecuteQueue({ requestPolicy: "network-only" })}
          router={router}
        />
      )}
      {activeTab === "history" && (
        <HistoryTab
          history={historyResult.data?.agentStatusHistory ?? []}
          fetching={historyResult.fetching}
          onRefresh={() => reexecuteHistory({ requestPolicy: "network-only" })}
        />
      )}
    </View>
  );
}

function StatCard({ label, value, isText }: { label: string; value: number | string; isText?: boolean }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{isText ? value : value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function OverviewTab({ agent, router }: { agent: Agent; router: ReturnType<typeof useRouter> }) {
  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {agent.currentTask && agent.currentTaskRef && (
        <TouchableOpacity
          style={styles.currentTaskCard}
          onPress={() => router.push(`/task/${agent.currentTaskRef!.id}`)}
          activeOpacity={0.7}
        >
          <Text style={styles.sectionLabel}>Current Task</Text>
          <Text style={styles.currentTaskTitle}>#{agent.currentTaskRef.taskNumber} {agent.currentTaskRef.title}</Text>
          {agent.statusMessage && (
            <Text style={styles.statusMessage}>{agent.statusMessage}</Text>
          )}
        </TouchableOpacity>
      )}

      <View style={styles.infoCard}>
        <InfoRow label="Username" value={`@${agent.username}`} />
        <InfoRow label="Level" value={label(agent.level)} />
        {agent.hostingType && <InfoRow label="Hosting" value={label(agent.hostingType)} />}
        {agent.workspacePath && <InfoRow label="Workspace" value={agent.workspacePath} mono />}
        {agent.setupStatus && <InfoRow label="Setup" value={label(agent.setupStatus)} />}
        <InfoRow label="Joined" value={new Date(agent.createdAt).toLocaleDateString()} />
        {agent.lastHeartbeat && (
          <InfoRow
            label="Last Seen"
            value={new Date(agent.lastHeartbeat).toLocaleString(undefined, {
              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          />
        )}
      </View>

      {agent.personality && (
        <View style={styles.infoCard}>
          <Text style={styles.sectionLabel}>Personality</Text>
          <Text style={styles.personalityText}>{agent.personality}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function InfoRow({ label: lbl, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoKey}>{lbl}</Text>
      <Text
        style={[styles.infoValue, mono && { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11 }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function QueueTab({
  items,
  fetching,
  onRefresh,
  router,
}: {
  items: QueueItem[];
  fetching: boolean;
  onRefresh: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  if (fetching && items.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No queue items</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => {
        const color = QUEUE_STATUS_COLORS[item.status] ?? "#6b7280";
        return (
          <View style={styles.queueCard}>
            <View style={styles.queueCardHeader}>
              <View style={[styles.statusBadge, { backgroundColor: color + "22" }]}>
                <Text style={[styles.statusText, { color }]}>{label(item.status)}</Text>
              </View>
              {item.priority && (
                <View style={[styles.statusBadge, { backgroundColor: (PRIORITY_COLORS[item.priority] ?? "#6b7280") + "22" }]}>
                  <Text style={[styles.statusText, { color: PRIORITY_COLORS[item.priority] ?? "#6b7280" }]}>
                    {item.priority}
                  </Text>
                </View>
              )}
              <Text style={styles.queueType}>{label(item.itemType)}</Text>
            </View>
            <Text style={styles.queueTitle}>{item.title}</Text>
            {item.relatedTask && (
              <TouchableOpacity onPress={() => router.push(`/task/${item.relatedTask!.id}`)}>
                <Text style={styles.relatedTask}>
                  → #{item.relatedTask.taskNumber} {item.relatedTask.title}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }}
    />
  );
}

function HistoryTab({
  history,
  fetching,
  onRefresh,
}: {
  history: StatusHistory[];
  fetching: boolean;
  onRefresh: () => void;
}) {
  if (fetching && history.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  if (history.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No status history</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={history}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View style={styles.historyCard}>
          <View style={styles.historyRow}>
            <Text style={styles.historyFrom}>
              {item.fromDetailedStatus ? label(item.fromDetailedStatus) : item.fromStatus ? label(item.fromStatus) : "—"}
            </Text>
            <Text style={styles.historyArrow}>→</Text>
            <Text style={styles.historyTo}>
              {item.toDetailedStatus ? label(item.toDetailedStatus) : label(item.toStatus)}
            </Text>
          </View>
          {item.statusMessage && (
            <Text style={styles.historyMessage} numberOfLines={2}>{item.statusMessage}</Text>
          )}
          <Text style={styles.historyTime}>
            {new Date(item.timestamp).toLocaleString(undefined, {
              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  errorText: { fontSize: 16, color: "#dc2626" },
  emptyText: { fontSize: 15, color: "#9ca3af" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#fff",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  emojiWrapper: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center" },
  emoji: { fontSize: 26 },
  onlineDot: { position: "absolute", bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: "#fff" },
  headerInfo: { flex: 1, gap: 4 },
  agentName: { fontSize: 18, fontWeight: "700", color: "#111827" },
  agentRole: { fontSize: 13, color: "#6b7280" },
  statusRow: { flexDirection: "row", gap: 6, marginTop: 2 },
  statusBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: "600" },

  statsRow: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  statCard: { flex: 1, alignItems: "center", paddingVertical: 12, gap: 2 },
  statValue: { fontSize: 18, fontWeight: "700", color: "#111827" },
  statLabel: { fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.4 },

  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabItemActive: { borderBottomColor: "#2563eb" },
  tabText: { fontSize: 14, color: "#6b7280", fontWeight: "500" },
  tabTextActive: { color: "#2563eb", fontWeight: "600" },

  tabContent: { padding: 16, gap: 12 },
  listContent: { padding: 16, gap: 10 },

  currentTaskCard: {
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    gap: 6,
  },
  currentTaskTitle: { fontSize: 14, fontWeight: "600", color: "#1e40af" },
  statusMessage: { fontSize: 13, color: "#3b82f6" },

  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  infoKey: { fontSize: 13, color: "#6b7280", width: 90 },
  infoValue: { fontSize: 13, color: "#111827", flex: 1, textAlign: "right" },
  personalityText: { fontSize: 14, color: "#374151", lineHeight: 22 },

  queueCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  queueCardHeader: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  queueType: { fontSize: 11, color: "#9ca3af", marginLeft: "auto" },
  queueTitle: { fontSize: 14, fontWeight: "600", color: "#111827" },
  relatedTask: { fontSize: 12, color: "#2563eb" },

  historyCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 4,
  },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  historyFrom: { fontSize: 13, color: "#6b7280" },
  historyArrow: { fontSize: 13, color: "#9ca3af" },
  historyTo: { fontSize: 13, fontWeight: "600", color: "#111827" },
  historyMessage: { fontSize: 12, color: "#6b7280" },
  historyTime: { fontSize: 11, color: "#9ca3af" },
});
