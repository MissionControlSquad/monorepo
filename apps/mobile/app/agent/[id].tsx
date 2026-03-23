import {
  View,
  Text,
  ScrollView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
  TextInput,
  Modal,
  RefreshControl,
  Clipboard,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useQuery, useMutation, useSubscription } from "urql";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  AGENT_QUERY,
  AGENT_PROFILE_STATS_QUERY,
  AGENT_QUEUE_BY_AGENT_QUERY,
  AGENT_STATUS_HISTORY_QUERY,
  AGENT_ACTIONS_BY_AGENT_QUERY,
  CREATE_QUEUE_ITEM,
  UPDATE_QUEUE_ITEM_STATUS,
  DELETE_QUEUE_ITEM,
  ON_AGENT_STATUS_CHANGE,
  TASKS_BY_STATUS_FOR_AGENT_QUERY,
  DELIVERABLES_BY_AGENT_QUERY,
  SET_AGENT_VACATION,
  SET_AGENT_ACTIVATION,
} from "@agentcenter/graphql-client";
import { getStoredCookie } from "../../src/api/session";
import { useAuth } from "../../src/context/AuthContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Agent {
  id: string; name: string; role: string; status: string;
  detailedStatus: string | null; statusMessage: string | null;
  currentTaskId: string | null; currentTask: string | null;
  identityEmoji: string | null; level: string; username: string;
  lastHeartbeat: string | null; setupStatus: string | null;
  isOnVacation: boolean; personality: string | null;
  workspacePath: string | null; hostingType: string | null;
  createdAt: string; upgradeAvailable: boolean; apiKeyPrefix: string | null;
  cloudVm: { id: string; name: string; status: string; ipv4: string | null } | null;
  currentTaskRef: { id: string; title: string; taskNumber: number; status: string } | null;
}

interface AgentStats {
  tasksAssigned: number; tasksCompleted: number; deliverablesCount: number;
  totalWorkTimeMs: number; queueCompletionRate: number;
}

interface QueueItem {
  id: string; title: string; description: string | null; notes: string | null;
  status: string; priority: string | null; itemType: string;
  createdAt: string; startedAt: string | null; completedAt: string | null;
  relatedTask: { id: string; title: string; taskNumber: number; status: string } | null;
}

interface AgentAction {
  id: string; actionType: string; description: string;
  metadata: Record<string, unknown> | null; timestamp: string;
  task: { id: string; title: string; taskNumber: number } | null;
}

interface StatusHistory {
  id: string; fromStatus: string | null; toStatus: string;
  fromDetailedStatus: string | null; toDetailedStatus: string | null;
  statusMessage: string | null; timestamp: string;
}

interface AgentTask {
  id: string; title: string; taskNumber: number; status: string;
  priority: string | null; dueDate: string | null;
  assignees: { profile: { displayName: string } }[];
}

interface AgentDeliverable {
  id: string; title: string; kind: string; version: number;
  createdAt: string; language: string | null; fileName: string | null;
  task: { id: string; title: string; taskNumber: number } | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = { active: "#16a34a", idle: "#6b7280", blocked: "#dc2626" };
const DETAILED_STATUS_COLORS: Record<string, string> = {
  thinking: "#7c3aed", coding: "#2563eb", reviewing: "#4f46e5",
  researching: "#d97706", deploying: "#ea580c", testing: "#0891b2",
  writing: "#059669", waiting_review: "#d97706", waiting_input: "#d97706",
  waiting_dependency: "#d97706",
};
const QUEUE_STATUS_COLORS: Record<string, string> = {
  pending: "#6b7280", in_progress: "#d97706", completed: "#16a34a", cancelled: "#dc2626", blocked: "#7c3aed",
};
const PRIORITY_COLORS: Record<string, string> = { low: "#6b7280", medium: "#d97706", high: "#dc2626", urgent: "#7c3aed" };
const ACTION_ICONS: Record<string, string> = {
  thinking: "💭", coding: "💻", searching: "🔍", testing: "🧪", reviewing: "👀",
  deploying: "🚀", writing: "✍️", reading: "📖", executing: "⚡", planning: "📋",
  communicating: "💬", error: "❌", success: "✅", file_read: "📄", file_write: "📝",
  command: "⚙️", analysis: "🔬", research: "🧪",
};

type Tab = "overview" | "tasks" | "deliverables" | "queue" | "activity" | "history" | "setup";

function capLabel(s: string) { return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function isOnline(hb: string | null) { return !!hb && new Date(hb).getTime() > Date.now() - 2 * 60 * 1000; }
function getDotColor(agent: Agent): string {
  if (agent.detailedStatus && DETAILED_STATUS_COLORS[agent.detailedStatus]) return DETAILED_STATUS_COLORS[agent.detailedStatus];
  return STATUS_COLORS[agent.status] ?? "#6b7280";
}
function fmtDuration(ms: number) { const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); return h > 0 ? `${h}h ${m}m` : `${m}m`; }
function fmtTime(dateStr: string) {
  const d = new Date(dateStr); const now = Date.now(); const diff = now - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtDate(s: string) { return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AgentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const [agentResult, reexecuteAgent] = useQuery<{ agent: Agent | null }>({
    query: AGENT_QUERY, variables: { id }, requestPolicy: "cache-and-network",
  });
  const [statsResult] = useQuery<{ agentProfileStats: AgentStats | null }>({
    query: AGENT_PROFILE_STATS_QUERY, variables: { agentId: id }, requestPolicy: "cache-and-network",
  });
  const [queueResult, reexecuteQueue] = useQuery<{ agentQueueByAgent: QueueItem[] }>({
    query: AGENT_QUEUE_BY_AGENT_QUERY, variables: { agentId: id },
    requestPolicy: "cache-and-network", pause: activeTab !== "queue",
  });
  const [activityResult, reexecuteActivity] = useQuery<{ agentActionsByAgent: AgentAction[] }>({
    query: AGENT_ACTIONS_BY_AGENT_QUERY, variables: { agentId: id, limit: 60 },
    requestPolicy: "cache-and-network", pause: activeTab !== "activity",
  });
  const [historyResult, reexecuteHistory] = useQuery<{ agentStatusHistory: StatusHistory[] }>({
    query: AGENT_STATUS_HISTORY_QUERY, variables: { agentId: id, limit: 50 },
    requestPolicy: "cache-and-network", pause: activeTab !== "history",
  });
  const [tasksResult, reexecuteTasks] = useQuery<{ tasksByStatusForAgent: Record<string, AgentTask[]> }>({
    query: TASKS_BY_STATUS_FOR_AGENT_QUERY, variables: { agentId: id },
    requestPolicy: "cache-and-network", pause: activeTab !== "tasks",
  });
  const [deliverablesResult, reexecuteDeliverables] = useQuery<{ deliverablesByAgent: AgentDeliverable[] }>({
    query: DELIVERABLES_BY_AGENT_QUERY, variables: { agentId: id },
    requestPolicy: "cache-and-network", pause: activeTab !== "deliverables",
  });

  const [, setVacation] = useMutation(SET_AGENT_VACATION);
  const [, setActivation] = useMutation(SET_AGENT_ACTIVATION);

  // Live agent status via subscription
  const [statusSubResult] = useSubscription({
    query: ON_AGENT_STATUS_CHANGE,
    variables: { agentId: id },
  });

  const agentBase = agentResult.data?.agent;
  const liveStatus = statusSubResult.data?.agentStatusChanged;
  // Overlay live status fields onto the fetched agent object
  const agent = agentBase && liveStatus
    ? { ...agentBase, status: liveStatus.status, detailedStatus: liveStatus.detailedStatus, statusMessage: liveStatus.statusMessage, lastHeartbeat: liveStatus.lastHeartbeat }
    : agentBase;
  const stats = statsResult.data?.agentProfileStats;

  useEffect(() => {
    if (agent) {
      navigation.setOptions({
        title: agent.name,
        headerRight: () => (
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/agent/edit", params: { id } })}
            style={{ marginRight: 16 }}
          >
            <Ionicons name="create-outline" size={22} color="#2563eb" />
          </TouchableOpacity>
        ),
      });
    }
  }, [agent, navigation, router, id]);

  if (agentResult.fetching && !agent) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }
  if (!agent) {
    return <View style={styles.center}><Text style={styles.errorText}>Agent not found</Text></View>;
  }

  const online = isOnline(agent.lastHeartbeat);
  const dotColor = getDotColor(agent);
  const isDeactivated = agent.setupStatus === "deactivated";

  const handleVacationToggle = () => {
    const next = !agent.isOnVacation;
    Alert.alert(
      next ? "Enable Vacation" : "Disable Vacation",
      next ? "The agent will stop accepting new work." : "The agent will resume accepting new work.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: async () => {
          const res = await setVacation({ id, onVacation: next });
          if (res.error) Alert.alert("Error", "Failed to update vacation status");
          else reexecuteAgent({ requestPolicy: "network-only" });
        }},
      ]
    );
  };

  const handleActivationToggle = () => {
    const nextDeactivated = !isDeactivated;
    Alert.alert(
      nextDeactivated ? "Deactivate Agent" : "Reactivate Agent",
      nextDeactivated ? "The agent will be deactivated and unable to work." : "The agent will be reactivated.",
      [
        { text: "Cancel", style: "cancel" },
        { text: nextDeactivated ? "Deactivate" : "Reactivate", style: nextDeactivated ? "destructive" : "default",
          onPress: async () => {
            const res = await setActivation({ id, deactivated: nextDeactivated });
            if (res.error) Alert.alert("Error", "Failed to update activation");
            else reexecuteAgent({ requestPolicy: "network-only" });
          }
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.emojiWrapper}>
          <Text style={styles.emoji}>{agent.identityEmoji ?? "🤖"}</Text>
          <View style={[styles.onlineDot, { backgroundColor: online ? dotColor : "#d1d5db" }]} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.agentName}>{agent.name}</Text>
          <Text style={styles.agentRole}>{agent.role}</Text>
          <View style={styles.badgeRow}>
            {isDeactivated ? (
              <View style={[styles.badge, { backgroundColor: "#f3f4f6" }]}>
                <Text style={[styles.badgeText, { color: "#9ca3af" }]}>Deactivated</Text>
              </View>
            ) : (
              <View style={[styles.badge, { backgroundColor: (online ? dotColor : "#6b7280") + "22" }]}>
                <Text style={[styles.badgeText, { color: online ? dotColor : "#6b7280" }]}>
                  {online ? (agent.detailedStatus ? capLabel(agent.detailedStatus) : capLabel(agent.status)) : "Offline"}
                </Text>
              </View>
            )}
            {agent.isOnVacation && (
              <View style={[styles.badge, { backgroundColor: "#fef3c7" }]}>
                <Text style={[styles.badgeText, { color: "#d97706" }]}>On Vacation</Text>
              </View>
            )}
            {agent.upgradeAvailable && (
              <View style={[styles.badge, { backgroundColor: "#fef3c7" }]}>
                <Text style={[styles.badgeText, { color: "#d97706" }]}>↑ Upgrade</Text>
              </View>
            )}
          </View>
        </View>
        {/* Controls */}
        <View style={styles.headerControls}>
          <TouchableOpacity
            style={[styles.controlBtn, agent.isOnVacation && styles.controlBtnActive]}
            onPress={handleVacationToggle}
            activeOpacity={0.7}
          >
            <Ionicons name={agent.isOnVacation ? "sunny" : "moon-outline"} size={16} color={agent.isOnVacation ? "#d97706" : "#6b7280"} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlBtn, isDeactivated && styles.controlBtnDanger]}
            onPress={handleActivationToggle}
            activeOpacity={0.7}
          >
            <Ionicons name="power" size={16} color={isDeactivated ? "#dc2626" : "#16a34a"} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats */}
      {stats && (
        <View style={styles.statsRow}>
          <StatCard label="Assigned" value={stats.tasksAssigned} />
          <StatCard label="Completed" value={stats.tasksCompleted} />
          <StatCard label="Deliverables" value={stats.deliverablesCount} />
          <StatCard label="Work Time" value={fmtDuration(stats.totalWorkTimeMs)} isText />
        </View>
      )}

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
        bounces={false}
      >
        {(["overview", "tasks", "deliverables", "queue", "activity", "history", ...(agent.setupStatus !== "deactivated" ? ["setup"] : [])] as Tab[]).map((tab) => (
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
      </ScrollView>

      {activeTab === "overview" && <OverviewTab agent={agent} router={router} onRefresh={() => reexecuteAgent({ requestPolicy: "network-only" })} />}
      {activeTab === "tasks" && (
        <AgentTasksTab
          agentId={id}
          data={tasksResult.data?.tasksByStatusForAgent}
          fetching={tasksResult.fetching}
          onRefresh={() => reexecuteTasks({ requestPolicy: "network-only" })}
          router={router}
        />
      )}
      {activeTab === "deliverables" && (
        <AgentDeliverablesTab
          agentId={id}
          deliverables={deliverablesResult.data?.deliverablesByAgent ?? []}
          fetching={deliverablesResult.fetching}
          onRefresh={() => reexecuteDeliverables({ requestPolicy: "network-only" })}
          router={router}
        />
      )}
      {activeTab === "queue" && (
        <QueueTab
          agentId={id}
          items={queueResult.data?.agentQueueByAgent ?? []}
          fetching={queueResult.fetching}
          onRefresh={() => reexecuteQueue({ requestPolicy: "network-only" })}
          router={router}
        />
      )}
      {activeTab === "activity" && (
        <ActivityTab
          actions={activityResult.data?.agentActionsByAgent ?? []}
          fetching={activityResult.fetching}
          onRefresh={() => reexecuteActivity({ requestPolicy: "network-only" })}
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
      {activeTab === "setup" && <SetupTab agentId={id} />}
    </View>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, isText }: { label: string; value: number | string; isText?: boolean }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{isText ? value : (value as number).toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Upgrade Banner ────────────────────────────────────────────────────────────

function UpgradeBanner({ agentId, serverUrl }: { agentId: string; serverUrl: string | null }) {
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);

  const handleRequestUpgrade = async () => {
    if (!serverUrl) return;
    setRequesting(true);
    try {
      const cookie = getStoredCookie();
      const res = await fetch(`${serverUrl}/api/agents/${agentId}/request-config-upgrade`, {
        method: "POST",
        credentials: "include",
        headers: cookie ? { Cookie: `mc_session=${cookie}` } : {},
      });
      if (res.ok) {
        setRequested(true);
      } else {
        Alert.alert("Error", "Could not create upgrade task. Try again.");
      }
    } catch {
      Alert.alert("Error", "Network error. Try again.");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <View style={{ backgroundColor: "#fffbeb", borderRadius: 12, borderWidth: 1, borderColor: "#fde68a", padding: 14, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Ionicons name="arrow-up-circle" size={22} color="#d97706" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#92400e" }}>Upgrade Available</Text>
          <Text style={{ fontSize: 12, color: "#b45309", marginTop: 2 }}>
            A new version of the agent runtime is available. Create an upgrade task for the agent to apply it on next heartbeat.
          </Text>
        </View>
      </View>
      {requested ? (
        <View style={{ backgroundColor: "#dcfce7", borderRadius: 8, padding: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
          <Text style={{ fontSize: 12, color: "#15803d", fontWeight: "600" }}>Upgrade task created. Agent will apply it on next heartbeat.</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={{ backgroundColor: "#d97706", borderRadius: 8, paddingVertical: 9, alignItems: "center", opacity: requesting ? 0.6 : 1 }}
          onPress={handleRequestUpgrade}
          disabled={requesting}
          activeOpacity={0.8}
        >
          {requesting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Request Upgrade</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ agent, router, onRefresh }: { agent: Agent; router: ReturnType<typeof useRouter>; onRefresh: () => void }) {
  const { serverUrl } = useAuth();
  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {agent.upgradeAvailable && (
        <UpgradeBanner agentId={agent.id} serverUrl={serverUrl} />
      )}

      {agent.currentTask && agent.currentTaskRef && (
        <TouchableOpacity
          style={styles.currentTaskCard}
          onPress={() => router.push(`/task/${agent.currentTaskRef!.id}`)}
          activeOpacity={0.7}
        >
          <Text style={styles.sectionLabel}>Current Task</Text>
          <Text style={styles.currentTaskTitle}>#{agent.currentTaskRef.taskNumber} {agent.currentTaskRef.title}</Text>
          {agent.statusMessage && <Text style={styles.statusMessage}>{agent.statusMessage}</Text>}
        </TouchableOpacity>
      )}

      <View style={styles.infoCard}>
        <InfoRow label="Username" value={`@${agent.username}`} />
        <InfoRow label="Level" value={capLabel(agent.level)} />
        {agent.hostingType && <InfoRow label="Hosting" value={capLabel(agent.hostingType)} />}
        {agent.workspacePath && <InfoRow label="Workspace" value={agent.workspacePath} mono />}
        {agent.apiKeyPrefix && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
            <Text style={styles.infoKey}>API Key</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={[styles.infoValue, { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>
                {agent.apiKeyPrefix}…
              </Text>
              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    "Regenerate API Key",
                    "The current key will stop working immediately. Continue?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Regenerate",
                        style: "destructive",
                        onPress: async () => {
                          try {
                            const cookie = getStoredCookie();
                            const res = await fetch(`${serverUrl}/api/agents/${agent.id}/regenerate-key`, {
                              method: "POST",
                              credentials: "include",
                              headers: { ...(cookie ? { Cookie: `mc_session=${cookie}` } : {}) },
                            });
                            const data = await res.json() as { apiKey?: string; error?: string };
                            if (!res.ok) {
                              Alert.alert("Error", data.error ?? "Failed to regenerate");
                            } else {
                              Alert.alert("New API Key", data.apiKey ?? "", [
                                { text: "Copy & Close", onPress: onRefresh },
                              ]);
                            }
                          } catch {
                            Alert.alert("Error", "Network error");
                          }
                        },
                      },
                    ]
                  );
                }}
                style={{ backgroundColor: "#fef3c7", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#d97706" }}>Regen</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {agent.setupStatus && <InfoRow label="Setup" value={capLabel(agent.setupStatus)} />}
        <InfoRow label="Joined" value={fmtDate(agent.createdAt)} />
        {agent.lastHeartbeat && (
          <InfoRow label="Last Seen" value={fmtTime(agent.lastHeartbeat)} />
        )}
      </View>

      {agent.cloudVm && (
        <TouchableOpacity
          style={[styles.infoCard, { borderColor: "#dbeafe" }]}
          onPress={() => router.push(`/cloud/${agent.cloudVm!.id}`)}
          activeOpacity={0.75}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.sectionLabel}>Cloud VM</Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </View>
          <InfoRow label="Name" value={agent.cloudVm.name} />
          <InfoRow label="Status" value={capLabel(agent.cloudVm.status)} />
          {agent.cloudVm.ipv4 && <InfoRow label="IP" value={agent.cloudVm.ipv4} mono />}
        </TouchableOpacity>
      )}

      {agent.personality && (
        <View style={styles.infoCard}>
          <Text style={styles.sectionLabel}>Personality</Text>
          <Text style={styles.personalityText}>{agent.personality}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoKey}>{label}</Text>
      <Text style={[styles.infoValue, mono && { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11 }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

// ── Queue Tab ─────────────────────────────────────────────────────────────────

function QueueTab({
  agentId, items, fetching, onRefresh, router,
}: {
  agentId: string; items: QueueItem[]; fetching: boolean; onRefresh: () => void; router: ReturnType<typeof useRouter>;
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [, createItem] = useMutation(CREATE_QUEUE_ITEM);
  const [, updateItemStatus] = useMutation(UPDATE_QUEUE_ITEM_STATUS);
  const [, deleteItem] = useMutation(DELETE_QUEUE_ITEM);

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    await createItem({ agentId, title: newTitle.trim(), description: newDesc.trim() || null, itemType: "task" });
    setCreating(false);
    setNewTitle(""); setNewDesc("");
    setShowAddModal(false);
    onRefresh();
  };

  const handleStatusChange = (item: QueueItem) => {
    const options = ["pending", "in_progress", "completed", "cancelled", "blocked"]
      .filter((s) => s !== item.status)
      .map((s) => ({
        text: capLabel(s),
        onPress: async () => {
          await updateItemStatus({ id: item.id, status: s });
          onRefresh();
        },
      }));
    Alert.alert("Change Status", undefined, [...options, { text: "Cancel", style: "cancel" as const }]);
  };

  const handleDelete = (item: QueueItem) => {
    Alert.alert("Delete Item", `Delete "${item.title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deleteItem({ id: item.id }); onRefresh(); } },
    ]);
  };

  const grouped = {
    in_progress: items.filter((i) => i.status === "in_progress"),
    pending: items.filter((i) => i.status === "pending"),
    completed: items.filter((i) => i.status === "completed"),
    other: items.filter((i) => !["in_progress", "pending", "completed"].includes(i.status)),
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Add button */}
      <TouchableOpacity style={styles.addQueueBtn} onPress={() => setShowAddModal(true)} activeOpacity={0.7}>
        <Ionicons name="add-circle-outline" size={18} color="#2563eb" />
        <Text style={styles.addQueueBtnText}>Add Queue Item</Text>
      </TouchableOpacity>

      {fetching && items.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color="#2563eb" /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}><Text style={styles.emptyText}>Queue is empty</Text></View>
      ) : (
        <FlatList
          data={[
            ...grouped.in_progress.map((i) => ({ ...i, _group: "In Progress" })),
            ...grouped.pending.map((i) => ({ ...i, _group: "Pending" })),
            ...grouped.completed.map((i) => ({ ...i, _group: "Completed" })),
            ...grouped.other.map((i) => ({ ...i, _group: "Other" })),
          ]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index, separators }) => {
            const prevGroup = index > 0 ? (items as (QueueItem & { _group?: string })[])[index - 1]?._group : null;
            const showHeader = item._group !== prevGroup;
            return (
              <>
                {showHeader && <Text style={styles.groupHeader}>{item._group}</Text>}
                <QueueCard
                  item={item}
                  onStatusChange={() => handleStatusChange(item)}
                  onDelete={() => handleDelete(item)}
                  onTaskPress={item.relatedTask ? () => router.push(`/task/${item.relatedTask!.id}`) : undefined}
                />
              </>
            );
          }}
        />
      )}

      {/* Add modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Queue Item</Text>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.field}>
              <Text style={styles.label}>Title *</Text>
              <TextInput style={styles.input} value={newTitle} onChangeText={setNewTitle} placeholder="What needs to be done?" placeholderTextColor="#9ca3af" autoFocus />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Description</Text>
              <TextInput style={[styles.input, styles.textArea]} value={newDesc} onChangeText={setNewDesc} placeholder="Additional context…" placeholderTextColor="#9ca3af" multiline numberOfLines={3} textAlignVertical="top" />
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, (!newTitle.trim() || creating) && styles.primaryBtnDisabled]}
              onPress={handleCreate}
              disabled={!newTitle.trim() || creating}
              activeOpacity={0.8}
            >
              {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Add Item</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function QueueCard({ item, onStatusChange, onDelete, onTaskPress }: {
  item: QueueItem; onStatusChange: () => void; onDelete: () => void; onTaskPress?: () => void;
}) {
  const color = QUEUE_STATUS_COLORS[item.status] ?? "#6b7280";
  return (
    <View style={styles.queueCard}>
      <View style={styles.queueCardTop}>
        <TouchableOpacity style={[styles.badge, { backgroundColor: color + "22" }]} onPress={onStatusChange} activeOpacity={0.7}>
          <Text style={[styles.badgeText, { color }]}>{capLabel(item.status)}</Text>
        </TouchableOpacity>
        {item.priority && (
          <View style={[styles.badge, { backgroundColor: (PRIORITY_COLORS[item.priority] ?? "#6b7280") + "22" }]}>
            <Text style={[styles.badgeText, { color: PRIORITY_COLORS[item.priority] ?? "#6b7280" }]}>{item.priority}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={15} color="#d1d5db" />
        </TouchableOpacity>
      </View>
      <Text style={styles.queueTitle}>{item.title}</Text>
      {item.description && <Text style={styles.queueDesc} numberOfLines={2}>{item.description}</Text>}
      {item.relatedTask && onTaskPress && (
        <TouchableOpacity onPress={onTaskPress}>
          <Text style={styles.relatedTask}>→ #{item.relatedTask.taskNumber} {item.relatedTask.title}</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.queueTime}>{fmtTime(item.createdAt)}</Text>
    </View>
  );
}

// ── Agent Tasks Tab ───────────────────────────────────────────────────────────

const TASK_STATUS_COLORS: Record<string, string> = {
  inbox: "#6b7280", assigned: "#2563eb", in_progress: "#d97706",
  review: "#7c3aed", done: "#16a34a", blocked: "#dc2626",
};
const TASK_PRIORITY_COLORS: Record<string, string> = {
  low: "#6b7280", medium: "#d97706", high: "#dc2626", urgent: "#7c3aed",
};

function AgentTasksTab({
  agentId,
  data,
  fetching,
  onRefresh,
  router,
}: {
  agentId: string;
  data: Record<string, AgentTask[]> | undefined;
  fetching: boolean;
  onRefresh: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const insets = useSafeAreaInsets();

  // Flatten all tasks from all status buckets
  const allTasks: AgentTask[] = data
    ? Object.values(data).flat().filter((t): t is AgentTask => !!t && typeof t === "object" && "id" in t)
    : [];

  if (fetching && allTasks.length === 0) {
    return <View style={styles.center}><ActivityIndicator color="#2563eb" /></View>;
  }

  if (allTasks.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No tasks assigned</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={allTasks}
      keyExtractor={(t) => t.id}
      contentContainerStyle={[styles.tabContent, { paddingBottom: insets.bottom + 16 }]}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl refreshing={fetching && allTasks.length > 0} onRefresh={onRefresh} tintColor="#2563eb" />
      }
      renderItem={({ item }) => {
        const statusColor = TASK_STATUS_COLORS[item.status] ?? "#6b7280";
        const priorityColor = item.priority ? (TASK_PRIORITY_COLORS[item.priority] ?? "#6b7280") : null;
        return (
          <TouchableOpacity
            style={styles.taskRow}
            onPress={() => router.push(`/task/${item.id}`)}
            activeOpacity={0.7}
          >
            <View style={styles.taskRowHeader}>
              <Text style={styles.taskNumber}>#{item.taskNumber}</Text>
              <View style={[styles.statusPill, { backgroundColor: statusColor + "18" }]}>
                <Text style={[styles.statusPillText, { color: statusColor }]}>
                  {item.status.replace("_", " ")}
                </Text>
              </View>
              {priorityColor && (
                <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
              )}
            </View>
            <Text style={styles.taskTitle} numberOfLines={2}>{item.title}</Text>
            {item.dueDate && (
              <Text style={styles.taskDue}>Due {fmtDate(item.dueDate)}</Text>
            )}
          </TouchableOpacity>
        );
      }}
    />
  );
}

// ── Agent Deliverables Tab ────────────────────────────────────────────────────

const KIND_ICONS: Record<string, string> = {
  markdown: "📄", code: "💻", link: "🔗", file: "📎",
};
const KIND_COLORS: Record<string, string> = {
  markdown: "#2563eb", code: "#7c3aed", link: "#059669", file: "#d97706",
};

function AgentDeliverablesTab({
  agentId,
  deliverables,
  fetching,
  onRefresh,
  router,
}: {
  agentId: string;
  deliverables: AgentDeliverable[];
  fetching: boolean;
  onRefresh: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const insets = useSafeAreaInsets();

  if (fetching && deliverables.length === 0) {
    return <View style={styles.center}><ActivityIndicator color="#2563eb" /></View>;
  }

  if (deliverables.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No deliverables yet</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={deliverables}
      keyExtractor={(d) => d.id}
      contentContainerStyle={[styles.tabContent, { paddingBottom: insets.bottom + 16 }]}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl refreshing={fetching && deliverables.length > 0} onRefresh={onRefresh} tintColor="#2563eb" />
      }
      renderItem={({ item }) => {
        const kindColor = KIND_COLORS[item.kind] ?? "#6b7280";
        const kindIcon = KIND_ICONS[item.kind] ?? "📄";
        return (
          <TouchableOpacity
            style={styles.deliverableRow}
            onPress={() => router.push(`/deliverable/${item.id}`)}
            activeOpacity={0.7}
          >
            <View style={[styles.deliverableKindBadge, { backgroundColor: kindColor + "18" }]}>
              <Text style={styles.deliverableKindIcon}>{kindIcon}</Text>
              <Text style={[styles.deliverableKindText, { color: kindColor }]}>
                {item.kind} · v{item.version}
              </Text>
            </View>
            <Text style={styles.deliverableTitle} numberOfLines={2}>{item.title}</Text>
            {item.task && (
              <Text style={styles.deliverableTask} numberOfLines={1}>
                #{item.task.taskNumber} {item.task.title}
              </Text>
            )}
            <Text style={styles.deliverableDate}>{fmtDate(item.createdAt)}</Text>
          </TouchableOpacity>
        );
      }}
    />
  );
}

// ── Activity Tab ──────────────────────────────────────────────────────────────

function ActivityTab({ actions, fetching, onRefresh, router }: {
  actions: AgentAction[]; fetching: boolean; onRefresh: () => void; router: ReturnType<typeof useRouter>;
}) {
  if (fetching && actions.length === 0) return <View style={styles.center}><ActivityIndicator color="#2563eb" /></View>;
  if (actions.length === 0) return <View style={styles.center}><Text style={styles.emptyText}>No activity yet</Text></View>;

  return (
    <FlatList
      data={actions}
      keyExtractor={(a) => a.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => {
        const icon = ACTION_ICONS[item.actionType] ?? "⚡";
        return (
          <View style={styles.activityCard}>
            <View style={styles.activityLeft}>
              <Text style={styles.actionIcon}>{icon}</Text>
              <View style={styles.activityLine} />
            </View>
            <View style={styles.activityBody}>
              <View style={styles.activityHeader}>
                <View style={styles.actionTypeBadge}>
                  <Text style={styles.actionTypeText}>{capLabel(item.actionType)}</Text>
                </View>
                <Text style={styles.activityTime}>{fmtTime(item.timestamp)}</Text>
              </View>
              <Text style={styles.activityDesc}>{item.description}</Text>
              {item.task && (
                <TouchableOpacity onPress={() => router.push(`/task/${item.task!.id}`)}>
                  <Text style={styles.relatedTask}>→ #{item.task.taskNumber} {item.task.title}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      }}
    />
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────

function HistoryTab({ history, fetching, onRefresh }: {
  history: StatusHistory[]; fetching: boolean; onRefresh: () => void;
}) {
  if (fetching && history.length === 0) return <View style={styles.center}><ActivityIndicator color="#2563eb" /></View>;
  if (history.length === 0) return <View style={styles.center}><Text style={styles.emptyText}>No status history</Text></View>;

  return (
    <FlatList
      data={history}
      keyExtractor={(h) => h.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View style={styles.historyCard}>
          <View style={styles.historyRow}>
            <Text style={styles.historyFrom}>
              {item.fromDetailedStatus ? capLabel(item.fromDetailedStatus) : item.fromStatus ? capLabel(item.fromStatus) : "—"}
            </Text>
            <Ionicons name="arrow-forward" size={12} color="#9ca3af" />
            <Text style={styles.historyTo}>
              {item.toDetailedStatus ? capLabel(item.toDetailedStatus) : capLabel(item.toStatus)}
            </Text>
          </View>
          {item.statusMessage && <Text style={styles.historyMessage} numberOfLines={2}>{item.statusMessage}</Text>}
          <Text style={styles.historyTime}>{fmtTime(item.timestamp)}</Text>
        </View>
      )}
    />
  );
}

// ── Setup Tab ────────────────────────────────────────────────────────────────

interface AgentSetupData {
  agent: {
    id: string;
    name: string;
    role: string;
    setupStatus: string;
    apiKeyPrefix: string | null;
    hostingType: string;
    cloudVmId: string | null;
  };
  configFiles: { filename: string; content: string }[];
  bootstrapMessage: string;
  cronSchedule: string;
  cronCommand: string;
  workspacePath: string;
  cloudVms: { id: string; name?: string | null; serverName?: string | null; ipv4: string | null; region: string; serverType: string }[];
}

type SetupMode = "auto" | "manual";

function SetupTab({ agentId }: { agentId: string }) {
  const { serverUrl } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [setup, setSetup] = useState<AgentSetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mode, setMode] = useState<SetupMode>("auto");
  const [regenerating, setRegenerating] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  const fetchSetup = () => {
    if (!serverUrl) return;
    setLoading(true);
    const cookie = getStoredCookie();
    fetch(`${serverUrl}/api/agents/${agentId}/setup`, {
      credentials: "include",
      headers: cookie ? { Cookie: `mc_session=${cookie}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: AgentSetupData) => setSetup(data))
      .catch(() => setError("Failed to load setup instructions"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchSetup(); }, [agentId, serverUrl]);

  const handleRegenerateKey = async () => {
    Alert.alert(
      "Regenerate API Key",
      "The current key will stop working immediately. A new key will be generated and embedded in the config files below.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          style: "destructive",
          onPress: async () => {
            if (!serverUrl || !setup) return;
            setRegenerating(true);
            try {
              const cookie = getStoredCookie();
              const res = await fetch(`${serverUrl}/api/agents/${agentId}/regenerate-key`, {
                method: "POST",
                credentials: "include",
                headers: cookie ? { Cookie: `mc_session=${cookie}` } : {},
              });
              const data = await res.json() as { apiKey?: string; error?: string };
              if (!res.ok) {
                Alert.alert("Error", data.error ?? "Failed to regenerate");
              } else {
                const key = data.apiKey ?? "";
                setNewApiKey(key);
                // Patch config files and bootstrap message with the real key
                setSetup((prev) => {
                  if (!prev) return prev;
                  const patch = (s: string) => s.replaceAll("$API_KEY", key);
                  return {
                    ...prev,
                    bootstrapMessage: patch(prev.bootstrapMessage),
                    configFiles: prev.configFiles.map((f) => ({ ...f, content: patch(f.content) })),
                  };
                });
              }
            } catch {
              Alert.alert("Error", "Failed to regenerate API key");
            } finally {
              setRegenerating(false);
            }
          },
        },
      ]
    );
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#2563eb" /></View>;
  if (error) return <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>;
  if (!setup) return <View style={styles.center}><Text style={styles.emptyText}>No setup data</Text></View>;

  return (
    <ScrollView
      contentContainerStyle={[styles.tabContent, { paddingBottom: insets.bottom + 16 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Mode toggle */}
      <View style={styles.modeToggle}>
        {(["auto", "manual"] as SetupMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
            onPress={() => setMode(m)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={m === "auto" ? "send-outline" : "construct-outline"}
              size={14}
              color={mode === m ? "#2563eb" : "#6b7280"}
            />
            <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
              {m === "auto" ? "Auto Setup" : "Manual Setup"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Security warning */}
      <View style={styles.warningBox}>
        <Ionicons name="shield-outline" size={16} color="#dc2626" />
        <Text style={styles.warningText}>
          These credentials grant full access to your system. Do not share publicly.
        </Text>
      </View>

      {/* API Key section */}
      {newApiKey ? (
        <View style={styles.newKeyBox}>
          <View style={styles.newKeyHeader}>
            <Ionicons name="warning-outline" size={16} color="#d97706" />
            <Text style={styles.newKeyTitle}>New API Key — Save now!</Text>
            <TouchableOpacity
              onPress={() => {
                Clipboard.setString(newApiKey);
                Alert.alert("Copied", "API key copied to clipboard");
              }}
              style={styles.copyBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="copy-outline" size={14} color="#2563eb" />
              <Text style={styles.copyBtnText}>Copy</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.newKeyHint}>This key will only be shown once. It's embedded in the configs below.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <Text style={styles.newKeyText} selectable>{newApiKey}</Text>
          </ScrollView>
        </View>
      ) : (
        <View style={styles.setupCard}>
          <View style={styles.setupCardRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.setupCardTitle}>API Key</Text>
              <Text style={styles.setupHint}>
                {setup.agent.apiKeyPrefix
                  ? `Current key: ${setup.agent.apiKeyPrefix}…`
                  : "No API key configured yet"}
              </Text>
              {!setup.agent.apiKeyPrefix && (
                <Text style={[styles.setupHint, { color: "#d97706" }]}>
                  Config files use $API_KEY placeholder. Regenerate to embed the real key.
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={[styles.regenBtn, regenerating && { opacity: 0.5 }]}
              onPress={handleRegenerateKey}
              disabled={regenerating}
              activeOpacity={0.7}
            >
              {regenerating ? (
                <ActivityIndicator size="small" color="#dc2626" />
              ) : (
                <Ionicons name="key-outline" size={14} color="#dc2626" />
              )}
              <Text style={styles.regenBtnText}>
                {regenerating ? "Regenerating…" : "Regenerate"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Auto mode: bootstrap message ── */}
      {mode === "auto" && (
        <>
          <View style={styles.infoBox}>
            <Ionicons name="chatbubble-outline" size={15} color="#2563eb" />
            <Text style={styles.infoBoxText}>
              Copy the message below and send it to your agent via any connected channel (WhatsApp, Slack, Discord, etc.)
            </Text>
          </View>

          {setup.bootstrapMessage ? (
            <View style={styles.setupCard}>
              <View style={styles.setupCardRow}>
                <Text style={styles.setupCardTitle}>Bootstrap Message</Text>
                <TouchableOpacity
                  onPress={() => {
                    Clipboard.setString(setup.bootstrapMessage);
                    Alert.alert("Copied", "Bootstrap message copied to clipboard");
                  }}
                  style={styles.copyBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="copy-outline" size={14} color="#2563eb" />
                  <Text style={styles.copyBtnText}>Copy</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                <Text style={styles.codeText} selectable>{setup.bootstrapMessage}</Text>
              </ScrollView>
            </View>
          ) : null}
        </>
      )}

      {/* ── Manual mode: workspace + config files + cron ── */}
      {mode === "manual" && (
        <>
          {/* Workspace path */}
          {setup.workspacePath && (
            <View style={styles.setupCard}>
              <Text style={styles.setupCardTitle}>1. Create Workspace</Text>
              <View style={styles.codeBlock}>
                <Text style={styles.codeText} selectable>mkdir -p {setup.workspacePath}</Text>
              </View>
            </View>
          )}

          {/* Config files */}
          {setup.configFiles.length > 0 && (
            <View style={styles.setupCard}>
              <Text style={styles.setupCardTitle}>2. Config Files ({setup.configFiles.length})</Text>
              <Text style={styles.setupHint}>
                Extract to{" "}
                <Text style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
                  {setup.workspacePath}/
                </Text>
              </Text>
              {setup.configFiles.map((file) => (
                <View key={file.filename} style={styles.configFileBlock}>
                  <TouchableOpacity
                    style={styles.configFileHeader}
                    onPress={() => setExpanded(expanded === file.filename ? null : file.filename)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.configFilePath} numberOfLines={1}>{file.filename}</Text>
                    <Ionicons
                      name={expanded === file.filename ? "chevron-up" : "chevron-down"}
                      size={16}
                      color="#6b7280"
                    />
                  </TouchableOpacity>
                  {expanded === file.filename && (
                    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.configFileContent} nestedScrollEnabled>
                      <Text style={styles.codeText} selectable>{file.content}</Text>
                    </ScrollView>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Cron command */}
          {setup.cronCommand && (
            <View style={styles.setupCard}>
              <View style={styles.setupCardRow}>
                <Text style={styles.setupCardTitle}>3. Heartbeat Cron</Text>
                <TouchableOpacity
                  onPress={() => {
                    Clipboard.setString(setup.cronCommand);
                    Alert.alert("Copied", "Cron command copied to clipboard");
                  }}
                  style={styles.copyBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="copy-outline" size={14} color="#2563eb" />
                  <Text style={styles.copyBtnText}>Copy</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.setupHint}>Add this to your crontab to keep the agent running</Text>
              <View style={styles.codeBlock}>
                <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
                  <Text style={styles.codeText} selectable>{setup.cronCommand}</Text>
                </ScrollView>
              </View>
            </View>
          )}
        </>
      )}

      {/* Cloud VMs shortcut */}
      {setup.cloudVms.length > 0 && (
        <TouchableOpacity
          style={styles.cloudVmsBtn}
          onPress={() => router.push("/cloud")}
          activeOpacity={0.7}
        >
          <Ionicons name="server-outline" size={16} color="#2563eb" />
          <Text style={styles.cloudVmsBtnText}>
            {setup.cloudVms.length} Cloud VM{setup.cloudVms.length !== 1 ? "s" : ""} available — Deploy to VM
          </Text>
          <Ionicons name="arrow-forward" size={14} color="#2563eb" />
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  errorText: { fontSize: 16, color: "#dc2626" },
  emptyText: { fontSize: 15, color: "#9ca3af" },

  header: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: "#fff", padding: 16,
    borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
  },
  emojiWrapper: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center" },
  emoji: { fontSize: 26 },
  onlineDot: { position: "absolute", bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: "#fff" },
  headerInfo: { flex: 1, gap: 4 },
  agentName: { fontSize: 18, fontWeight: "700", color: "#111827" },
  agentRole: { fontSize: 13, color: "#6b7280" },
  badgeRow: { flexDirection: "row", gap: 6, marginTop: 2, flexWrap: "wrap" },
  badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  headerControls: { gap: 8 },
  controlBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: "#f3f4f6",
    justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb",
  },
  controlBtnActive: { backgroundColor: "#fef3c7", borderColor: "#d97706" },
  controlBtnDanger: { backgroundColor: "#fee2e2", borderColor: "#dc2626" },

  statsRow: { flexDirection: "row", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  statCard: { flex: 1, alignItems: "center", paddingVertical: 10, gap: 2 },
  statValue: { fontSize: 16, fontWeight: "700", color: "#111827" },
  statLabel: { fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.3 },

  tabBar: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", minHeight: 46 },
  tabBarContent: { flexDirection: "row", alignItems: "stretch" },
  tabItem: { alignItems: "center", justifyContent: "center", paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabItemActive: { borderBottomColor: "#2563eb" },
  tabText: { fontSize: 13, color: "#6b7280", fontWeight: "500" },
  tabTextActive: { color: "#2563eb", fontWeight: "600" },

  tabContent: { padding: 16, gap: 12 },

  // Agent Tasks tab
  taskRow: {
    backgroundColor: "#fff", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: "#e5e7eb", gap: 6,
  },
  taskRowHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  taskNumber: { fontSize: 11, color: "#9ca3af", fontWeight: "500" },
  statusPill: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  statusPillText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  priorityDot: { width: 7, height: 7, borderRadius: 3.5 },
  taskTitle: { fontSize: 14, fontWeight: "600", color: "#111827", lineHeight: 19 },
  taskDue: { fontSize: 11, color: "#9ca3af" },

  // Agent Deliverables tab
  deliverableRow: {
    backgroundColor: "#fff", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: "#e5e7eb", gap: 6,
  },
  deliverableKindBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start",
  },
  deliverableKindIcon: { fontSize: 12 },
  deliverableKindText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  deliverableTitle: { fontSize: 14, fontWeight: "600", color: "#111827", lineHeight: 19 },
  deliverableTask: { fontSize: 12, color: "#6b7280" },
  deliverableDate: { fontSize: 11, color: "#9ca3af" },
  listContent: { padding: 16, gap: 10 },

  currentTaskCard: {
    backgroundColor: "#eff6ff", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: "#bfdbfe", gap: 6,
  },
  currentTaskTitle: { fontSize: 14, fontWeight: "600", color: "#1e40af" },
  statusMessage: { fontSize: 12, color: "#3b82f6" },

  infoCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: "#e5e7eb", gap: 10,
  },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  infoKey: { fontSize: 13, color: "#6b7280", width: 90 },
  infoValue: { fontSize: 13, color: "#111827", flex: 1, textAlign: "right" },
  personalityText: { fontSize: 14, color: "#374151", lineHeight: 22 },

  // Queue
  addQueueBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
  },
  addQueueBtnText: { fontSize: 14, color: "#2563eb", fontWeight: "500" },
  groupHeader: { fontSize: 11, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
  queueCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: "#e5e7eb", gap: 8,
  },
  queueCardTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  deleteBtn: { padding: 4 },
  queueTitle: { fontSize: 14, fontWeight: "600", color: "#111827" },
  queueDesc: { fontSize: 13, color: "#6b7280", lineHeight: 18 },
  relatedTask: { fontSize: 12, color: "#2563eb" },
  queueTime: { fontSize: 11, color: "#9ca3af" },

  // Activity
  activityCard: { flexDirection: "row", gap: 10 },
  activityLeft: { alignItems: "center", width: 32, gap: 4 },
  actionIcon: { fontSize: 20, textAlign: "center" },
  activityLine: { flex: 1, width: 1, backgroundColor: "#e5e7eb" },
  activityBody: { flex: 1, gap: 4, paddingBottom: 16 },
  activityHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  actionTypeBadge: { backgroundColor: "#f3f4f6", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  actionTypeText: { fontSize: 11, color: "#374151", fontWeight: "600" },
  activityTime: { fontSize: 11, color: "#9ca3af" },
  activityDesc: { fontSize: 13, color: "#374151", lineHeight: 18 },

  // History
  historyCard: {
    backgroundColor: "#fff", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "#e5e7eb", gap: 4,
  },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  historyFrom: { fontSize: 13, color: "#6b7280" },
  historyTo: { fontSize: 13, fontWeight: "600", color: "#111827" },
  historyMessage: { fontSize: 12, color: "#6b7280" },
  historyTime: { fontSize: 11, color: "#9ca3af" },

  // Modal
  modal: { flex: 1, backgroundColor: "#f9fafb" },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },
  modalContent: { padding: 20, gap: 16 },

  // Form (shared)
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151" },
  input: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb",
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: "#111827",
  },
  textArea: { minHeight: 80, paddingTop: 11 },
  primaryBtn: { backgroundColor: "#2563eb", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },

  // Setup tab
  setupCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: "#e5e7eb", gap: 8,
  },
  setupCardTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  setupHint: { fontSize: 12, color: "#9ca3af", marginBottom: 4 },
  codeBlock: {
    backgroundColor: "#1e293b", borderRadius: 8, padding: 12,
  },
  codeText: { fontSize: 12, color: "#e2e8f0", fontFamily: "monospace", lineHeight: 18 },
  configFileBlock: {
    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, overflow: "hidden",
  },
  configFileHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 10, backgroundColor: "#f8fafc",
  },
  configFilePath: { fontSize: 12, color: "#374151", fontWeight: "500", flex: 1 },
  configFileContent: { backgroundColor: "#1e293b", maxHeight: 200 },

  // Enhanced setup tab
  modeToggle: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modeBtnActive: { backgroundColor: "#fff" },
  modeBtnText: { fontSize: 12, fontWeight: "500", color: "#6b7280" },
  modeBtnTextActive: { color: "#2563eb", fontWeight: "600" },

  warningBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  warningText: { flex: 1, fontSize: 12, color: "#dc2626", lineHeight: 17 },

  newKeyBox: {
    backgroundColor: "#fffbeb",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#fde68a",
    gap: 8,
  },
  newKeyHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  newKeyTitle: { fontSize: 13, fontWeight: "700", color: "#d97706" },
  newKeyHint: { fontSize: 12, color: "#92400e" },
  newKeyText: {
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#111827",
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fde68a",
  },

  setupCardRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  regenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#fecaca",
    flexShrink: 0,
  },
  regenBtnText: { fontSize: 12, color: "#dc2626", fontWeight: "600" },

  infoBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  infoBoxText: { flex: 1, fontSize: 12, color: "#1d4ed8", lineHeight: 17 },

  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  copyBtnText: { fontSize: 12, color: "#2563eb", fontWeight: "600" },

  cloudVmsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  cloudVmsBtnText: { flex: 1, fontSize: 13, color: "#2563eb", fontWeight: "500" },
});
