import {
  View,
  Text,
  ScrollView,
  FlatList,
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
import { STATUS_HEX_COLORS, PRIORITY_HEX_COLORS, DEFAULT_COLOR, DEFAULT_AGENT_EMOJI, formatDate, humanizeLabel, DELIVERABLE_KIND_HEX_COLORS, DELIVERABLE_KIND_ICONS, formatRelativeTime, isAgentOnline, formatDuration, getAgentStatusColor } from "@agentcenter/utils";
import { getStoredCookie } from "../../src/api/session";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/hooks/useTheme";

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

const ACTION_ICONS: Record<string, string> = {
  thinking: "💭", coding: "💻", searching: "🔍", testing: "🧪", reviewing: "👀",
  deploying: "🚀", writing: "✍️", reading: "📖", executing: "⚡", planning: "📋",
  communicating: "💬", error: "❌", success: "✅", file_read: "📄", file_write: "📝",
  command: "⚙️", analysis: "🔬", research: "🧪",
};

type Tab = "overview" | "tasks" | "deliverables" | "queue" | "activity" | "history" | "setup";


// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AgentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { colors } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [agentResult, reexecuteAgent] = useQuery<{ agent: Agent | null }>({
    query: AGENT_QUERY, variables: { id }, requestPolicy: "cache-and-network",
    pause: !mounted,
  });
  const [statsResult] = useQuery<{ agentProfileStats: AgentStats | null }>({
    query: AGENT_PROFILE_STATS_QUERY, variables: { agentId: id }, requestPolicy: "cache-and-network",
    pause: !mounted,
  });
  const [queueResult, reexecuteQueue] = useQuery<{ agentQueueByAgent: QueueItem[] }>({
    query: AGENT_QUEUE_BY_AGENT_QUERY, variables: { agentId: id },
    requestPolicy: "cache-and-network", pause: !mounted || activeTab !== "queue",
  });
  const [activityResult, reexecuteActivity] = useQuery<{ agentActionsByAgent: AgentAction[] }>({
    query: AGENT_ACTIONS_BY_AGENT_QUERY, variables: { agentId: id, limit: 60 },
    requestPolicy: "cache-and-network", pause: !mounted || activeTab !== "activity",
  });
  const [historyResult, reexecuteHistory] = useQuery<{ agentStatusHistory: StatusHistory[] }>({
    query: AGENT_STATUS_HISTORY_QUERY, variables: { agentId: id, limit: 50 },
    requestPolicy: "cache-and-network", pause: !mounted || activeTab !== "history",
  });
  const [tasksResult, reexecuteTasks] = useQuery<{ tasksByStatusForAgent: Record<string, AgentTask[]> }>({
    query: TASKS_BY_STATUS_FOR_AGENT_QUERY, variables: { agentId: id },
    requestPolicy: "cache-and-network", pause: !mounted || activeTab !== "tasks",
  });
  const [deliverablesResult, reexecuteDeliverables] = useQuery<{ deliverablesByAgent: AgentDeliverable[] }>({
    query: DELIVERABLES_BY_AGENT_QUERY, variables: { agentId: id },
    requestPolicy: "cache-and-network", pause: !mounted || activeTab !== "deliverables",
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
            style={{ paddingHorizontal: 8 }}
          >
            <Ionicons name="create-outline" size={22} color={colors.accent} />
          </TouchableOpacity>
        ),
      });
    }
  }, [agent, navigation, router, id]);

  if (agentResult.fetching && !agent) {
    return <View className="flex-1 justify-center items-center gap-2"><ActivityIndicator size="large" color="#2563eb" /></View>;
  }
  if (!agent) {
    return <View className="flex-1 justify-center items-center gap-2"><Text className="text-base text-red-600 dark:text-red-400">Agent not found</Text></View>;
  }

  const online = isAgentOnline(agent.lastHeartbeat);
  const dotColor = getAgentStatusColor(agent);
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
    <View className="flex-1 bg-gray-50 dark:bg-slate-900">
      {/* Header */}
      <View className="flex-row items-start gap-3 bg-white dark:bg-slate-800 p-4 border-b border-gray-200 dark:border-slate-700">
        <View className="w-14 h-14 rounded-full bg-gray-100 dark:bg-slate-700 justify-center items-center">
          <Text className="text-2xl">{agent.identityEmoji ?? DEFAULT_AGENT_EMOJI}</Text>
          <View
            className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-800"
            style={{ backgroundColor: online ? dotColor : "#d1d5db" }}
          />
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-lg font-bold text-gray-900 dark:text-slate-100">{agent.name}</Text>
          <Text className="text-sm text-gray-500 dark:text-slate-400">{agent.role}</Text>
          <View className="flex-row gap-1.5 mt-0.5 flex-wrap">
            {isDeactivated ? (
              <View className="rounded bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5">
                <Text className="text-xs font-semibold text-gray-400 dark:text-slate-500">Deactivated</Text>
              </View>
            ) : (
              <View
                className="rounded px-1.5 py-0.5"
                style={{ backgroundColor: (online ? dotColor : "#6b7280") + "22" }}
              >
                <Text className="text-xs font-semibold" style={{ color: online ? dotColor : "#6b7280" }}>
                  {online ? (agent.detailedStatus ? humanizeLabel(agent.detailedStatus) : humanizeLabel(agent.status)) : "Offline"}
                </Text>
              </View>
            )}
            {agent.isOnVacation && (
              <View className="rounded bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5">
                <Text className="text-xs font-semibold text-amber-600 dark:text-amber-400">On Vacation</Text>
              </View>
            )}
            {agent.upgradeAvailable && (
              <View className="rounded bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5">
                <Text className="text-xs font-semibold text-amber-600 dark:text-amber-400">↑ Upgrade</Text>
              </View>
            )}
          </View>
        </View>
        {/* Controls */}
        <View className="gap-2">
          <TouchableOpacity
            className={`w-8 h-8 rounded-lg justify-center items-center border ${agent.isOnVacation ? "bg-amber-50 dark:bg-amber-900/20 border-amber-400 dark:border-amber-600" : "bg-gray-100 dark:bg-slate-700 border-gray-200 dark:border-slate-600"}`}
            onPress={handleVacationToggle}
            activeOpacity={0.7}
          >
            <Ionicons name={agent.isOnVacation ? "sunny" : "moon-outline"} size={16} color={agent.isOnVacation ? "#d97706" : "#6b7280"} />
          </TouchableOpacity>
          <TouchableOpacity
            className={`w-8 h-8 rounded-lg justify-center items-center border ${isDeactivated ? "bg-red-100 dark:bg-red-950/30 border-red-600 dark:border-red-500" : "bg-gray-100 dark:bg-slate-700 border-gray-200 dark:border-slate-600"}`}
            onPress={handleActivationToggle}
            activeOpacity={0.7}
          >
            <Ionicons name="power" size={16} color={isDeactivated ? "#dc2626" : "#16a34a"} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats */}
      {stats && (
        <View className="flex-row bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
          <StatCard label="Assigned" value={stats.tasksAssigned} />
          <StatCard label="Completed" value={stats.tasksCompleted} />
          <StatCard label="Deliverables" value={stats.deliverablesCount} />
          <StatCard label="Work Time" value={formatDuration(stats.totalWorkTimeMs)} isText />
        </View>
      )}

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 min-h-12 max-h-12"
        contentContainerStyle={{ flexDirection: "row", alignItems: "stretch" }}
        bounces={false}
      >
        {(["overview", "tasks", "deliverables", "queue", "activity", "history", ...(agent.setupStatus !== "deactivated" ? ["setup"] : [])] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            className={`items-center justify-center py-3.5 px-3.5 border-b-2 ${activeTab === tab ? "border-blue-600" : "border-transparent"}`}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.7}
          >
            <Text className={`text-sm ${activeTab === tab ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-gray-500 dark:text-slate-400 font-medium"}`}>
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
    <View className="flex-1 items-center py-2.5 gap-0.5">
      <Text className="text-base font-bold text-gray-900 dark:text-slate-100">{isText ? value : (value as number).toLocaleString()}</Text>
      <Text className="text-xs text-gray-400 dark:text-slate-500 uppercase tracking-[0.3px]">{label}</Text>
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
    <View className="bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-700 p-3.5 gap-2.5">
      <View className="flex-row items-center gap-2.5">
        <Ionicons name="arrow-up-circle" size={22} color="#d97706" />
        <View className="flex-1">
          <Text className="text-sm font-bold text-amber-900 dark:text-amber-200">Upgrade Available</Text>
          <Text className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
            A new version of the agent runtime is available. Create an upgrade task for the agent to apply it on next heartbeat.
          </Text>
        </View>
      </View>
      {requested ? (
        <View className="bg-green-100 dark:bg-green-900/20 rounded-lg p-2.5 flex-row items-center gap-1.5">
          <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
          <Text className="text-xs text-green-700 dark:text-green-400 font-semibold">Upgrade task created. Agent will apply it on next heartbeat.</Text>
        </View>
      ) : (
        <TouchableOpacity
          className="bg-amber-600 rounded-lg py-2.5 items-center"
          style={{ opacity: requesting ? 0.6 : 1 }}
          onPress={handleRequestUpgrade}
          disabled={requesting}
          activeOpacity={0.8}
        >
          {requesting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white text-sm font-semibold">Request Upgrade</Text>
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
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      {agent.upgradeAvailable && (
        <UpgradeBanner agentId={agent.id} serverUrl={serverUrl} />
      )}

      {agent.currentTask && agent.currentTaskRef && (
        <TouchableOpacity
          className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3.5 border border-blue-200 dark:border-blue-800 gap-1.5"
          onPress={() => router.push(`/task/${agent.currentTaskRef!.id}`)}
          activeOpacity={0.7}
        >
          <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.5px]">Current Task</Text>
          <Text className="text-sm font-semibold text-blue-800 dark:text-blue-300">#{agent.currentTaskRef.taskNumber} {agent.currentTaskRef.title}</Text>
          {agent.statusMessage && <Text className="text-xs text-blue-500 dark:text-blue-400">{agent.statusMessage}</Text>}
        </TouchableOpacity>
      )}

      <View className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 gap-2.5">
        <InfoRow label="Username" value={`@${agent.username}`} />
        <InfoRow label="Level" value={humanizeLabel(agent.level)} />
        {agent.hostingType && <InfoRow label="Hosting" value={humanizeLabel(agent.hostingType)} />}
        {agent.workspacePath && <InfoRow label="Workspace" value={agent.workspacePath} mono />}
        {agent.apiKeyPrefix && (
          <View className="flex-row items-center justify-between py-2.5 border-b border-gray-100 dark:border-slate-700">
            <Text className="text-sm text-gray-500 dark:text-slate-400 w-24">API Key</Text>
            <View className="flex-row items-center gap-2.5">
              <Text
                className="text-sm text-gray-900 dark:text-slate-100 flex-1 text-right"
                style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
              >
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
                className="bg-amber-50 dark:bg-amber-900/20 rounded-md px-2 py-1"
                activeOpacity={0.7}
              >
                <Text className="text-xs font-semibold text-amber-600 dark:text-amber-400">Regen</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {agent.setupStatus && <InfoRow label="Setup" value={humanizeLabel(agent.setupStatus)} />}
        <InfoRow label="Joined" value={formatDate(agent.createdAt)} />
        {agent.lastHeartbeat && (
          <InfoRow label="Last Seen" value={formatRelativeTime(agent.lastHeartbeat)} />
        )}
      </View>

      {agent.cloudVm && (
        <TouchableOpacity
          className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-blue-200 dark:border-blue-800 gap-2.5"
          onPress={() => router.push(`/cloud/${agent.cloudVm!.id}`)}
          activeOpacity={0.75}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.5px]">Cloud VM</Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </View>
          <InfoRow label="Name" value={agent.cloudVm.name} />
          <InfoRow label="Status" value={humanizeLabel(agent.cloudVm.status)} />
          {agent.cloudVm.ipv4 && <InfoRow label="IP" value={agent.cloudVm.ipv4} mono />}
        </TouchableOpacity>
      )}

      {agent.personality && (
        <View className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 gap-2.5">
          <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.5px]">Personality</Text>
          <Text className="text-sm text-gray-700 dark:text-slate-300 leading-6">{agent.personality}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text className="text-sm text-gray-500 dark:text-slate-400 w-24">{label}</Text>
      <Text
        className="text-sm text-gray-900 dark:text-slate-100 flex-1 text-right"
        style={mono ? { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11 } : undefined}
        numberOfLines={2}
      >
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
        text: humanizeLabel(s),
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
    <View className="flex-1">
      {/* Add button */}
      <TouchableOpacity
        className="flex-row items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700"
        onPress={() => setShowAddModal(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="add-circle-outline" size={18} color="#2563eb" />
        <Text className="text-sm text-blue-600 dark:text-blue-400 font-medium">Add Queue Item</Text>
      </TouchableOpacity>

      {fetching && items.length === 0 ? (
        <View className="flex-1 justify-center items-center gap-2"><ActivityIndicator color="#2563eb" /></View>
      ) : items.length === 0 ? (
        <View className="flex-1 justify-center items-center gap-2"><Text className="text-base text-gray-400 dark:text-slate-500">Queue is empty</Text></View>
      ) : (
        <FlatList
          data={[
            ...grouped.in_progress.map((i) => ({ ...i, _group: "In Progress" })),
            ...grouped.pending.map((i) => ({ ...i, _group: "Pending" })),
            ...grouped.completed.map((i) => ({ ...i, _group: "Completed" })),
            ...grouped.other.map((i) => ({ ...i, _group: "Other" })),
          ]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item, index, separators }) => {
            const prevGroup = index > 0 ? (items as (QueueItem & { _group?: string })[])[index - 1]?._group : null;
            const showHeader = item._group !== prevGroup;
            return (
              <>
                {showHeader && (
                  <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.5px] mb-1.5 mt-1">
                    {item._group}
                  </Text>
                )}
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
        <View className="flex-1 bg-gray-50 dark:bg-slate-900">
          <View className="flex-row items-center justify-between p-4 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
            <Text className="text-lg font-bold text-gray-900 dark:text-slate-100">Add Queue Item</Text>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            <View className="gap-1.5">
              <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Title *</Text>
              <TextInput
                className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="What needs to be done?"
                placeholderTextColor="#9ca3af"
                autoFocus
              />
            </View>
            <View className="gap-1.5">
              <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Description</Text>
              <TextInput
                className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100 min-h-20"
                value={newDesc}
                onChangeText={setNewDesc}
                placeholder="Additional context…"
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
            <TouchableOpacity
              className="bg-blue-600 rounded-xl py-3.5 items-center"
              style={{ opacity: (!newTitle.trim() || creating) ? 0.45 : 1 }}
              onPress={handleCreate}
              disabled={!newTitle.trim() || creating}
              activeOpacity={0.8}
            >
              {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-white text-base font-semibold">Add Item</Text>}
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
  const color = STATUS_HEX_COLORS[item.status] ?? DEFAULT_COLOR;
  return (
    <View className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 gap-2">
      <View className="flex-row items-center gap-1.5">
        <TouchableOpacity
          className="rounded px-1.5 py-0.5"
          style={{ backgroundColor: color + "22" }}
          onPress={onStatusChange}
          activeOpacity={0.7}
        >
          <Text className="text-xs font-semibold" style={{ color }}>{humanizeLabel(item.status)}</Text>
        </TouchableOpacity>
        {item.priority && (
          <View
            className="rounded px-1.5 py-0.5"
            style={{ backgroundColor: (PRIORITY_HEX_COLORS[item.priority] ?? DEFAULT_COLOR) + "22" }}
          >
            <Text className="text-xs font-semibold" style={{ color: PRIORITY_HEX_COLORS[item.priority] ?? DEFAULT_COLOR }}>{item.priority}</Text>
          </View>
        )}
        <View className="flex-1" />
        <TouchableOpacity onPress={onDelete} className="p-1">
          <Ionicons name="trash-outline" size={15} color="#d1d5db" />
        </TouchableOpacity>
      </View>
      <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100">{item.title}</Text>
      {item.description && <Text className="text-sm text-gray-500 dark:text-slate-400 leading-5" numberOfLines={2}>{item.description}</Text>}
      {item.relatedTask && onTaskPress && (
        <TouchableOpacity onPress={onTaskPress}>
          <Text className="text-xs text-blue-600 dark:text-blue-400">→ #{item.relatedTask.taskNumber} {item.relatedTask.title}</Text>
        </TouchableOpacity>
      )}
      <Text className="text-xs text-gray-400 dark:text-slate-500">{formatRelativeTime(item.createdAt)}</Text>
    </View>
  );
}

// ── Agent Tasks Tab ───────────────────────────────────────────────────────────


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
    return <View className="flex-1 justify-center items-center gap-2"><ActivityIndicator color="#2563eb" /></View>;
  }

  if (allTasks.length === 0) {
    return (
      <View className="flex-1 justify-center items-center gap-2">
        <Text className="text-base text-gray-400 dark:text-slate-500">No tasks assigned</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1 }}
      data={allTasks}
      keyExtractor={(t) => t.id}
      contentContainerStyle={[{ padding: 16, gap: 12 }, { paddingBottom: insets.bottom + 16 }]}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl refreshing={fetching && allTasks.length > 0} onRefresh={onRefresh} tintColor="#2563eb" />
      }
      renderItem={({ item }) => {
        const statusColor = STATUS_HEX_COLORS[item.status] ?? DEFAULT_COLOR;
        const priorityColor = item.priority ? (PRIORITY_HEX_COLORS[item.priority] ?? DEFAULT_COLOR) : null;
        return (
          <TouchableOpacity
            className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 gap-1.5"
            onPress={() => router.push(`/task/${item.id}`)}
            activeOpacity={0.7}
          >
            <View className="flex-row items-center gap-2">
              <Text className="text-xs text-gray-400 dark:text-slate-500 font-medium">#{item.taskNumber}</Text>
              <View className="rounded px-2 py-0.5" style={{ backgroundColor: statusColor + "18" }}>
                <Text className="text-xs font-semibold capitalize" style={{ color: statusColor }}>
                  {item.status.replace("_", " ")}
                </Text>
              </View>
              {priorityColor && (
                <View className="w-2 h-2 rounded" style={{ backgroundColor: priorityColor }} />
              )}
            </View>
            <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100 leading-5" numberOfLines={2}>{item.title}</Text>
            {item.dueDate && (
              <Text className="text-xs text-gray-400 dark:text-slate-500">Due {formatDate(item.dueDate)}</Text>
            )}
          </TouchableOpacity>
        );
      }}
    />
  );
}

// ── Agent Deliverables Tab ────────────────────────────────────────────────────

const KIND_ICONS = DELIVERABLE_KIND_ICONS;
const KIND_COLORS = DELIVERABLE_KIND_HEX_COLORS;

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
    return <View className="flex-1 justify-center items-center gap-2"><ActivityIndicator color="#2563eb" /></View>;
  }

  if (deliverables.length === 0) {
    return (
      <View className="flex-1 justify-center items-center gap-2">
        <Text className="text-base text-gray-400 dark:text-slate-500">No deliverables yet</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1 }}
      data={deliverables}
      keyExtractor={(d) => d.id}
      contentContainerStyle={[{ padding: 16, gap: 12 }, { paddingBottom: insets.bottom + 16 }]}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl refreshing={fetching && deliverables.length > 0} onRefresh={onRefresh} tintColor="#2563eb" />
      }
      renderItem={({ item }) => {
        const kindColor = KIND_COLORS[item.kind] ?? DEFAULT_COLOR;
        const kindIcon = KIND_ICONS[item.kind] ?? "📄";
        return (
          <TouchableOpacity
            className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 gap-1.5"
            onPress={() => router.push(`/deliverable/${item.id}`)}
            activeOpacity={0.7}
          >
            <View
              className="flex-row items-center gap-1 rounded-md px-2 py-1 self-start"
              style={{ backgroundColor: kindColor + "18" }}
            >
              <Text className="text-xs">{kindIcon}</Text>
              <Text className="text-xs font-semibold capitalize" style={{ color: kindColor }}>
                {item.kind} · v{item.version}
              </Text>
            </View>
            <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100 leading-5" numberOfLines={2}>{item.title}</Text>
            {item.task && (
              <Text className="text-xs text-gray-500 dark:text-slate-400" numberOfLines={1}>
                #{item.task.taskNumber} {item.task.title}
              </Text>
            )}
            <Text className="text-xs text-gray-400 dark:text-slate-500">{formatDate(item.createdAt)}</Text>
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
  if (fetching && actions.length === 0) return <View className="flex-1 justify-center items-center gap-2"><ActivityIndicator color="#2563eb" /></View>;
  if (actions.length === 0) return <View className="flex-1 justify-center items-center gap-2"><Text className="text-base text-gray-400 dark:text-slate-500">No activity yet</Text></View>;

  return (
    <FlatList
      style={{ flex: 1 }}
      data={actions}
      keyExtractor={(a) => a.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      renderItem={({ item }) => {
        const icon = ACTION_ICONS[item.actionType] ?? "⚡";
        return (
          <View className="flex-row gap-2.5">
            <View className="items-center w-8 gap-1">
              <Text className="text-xl text-center">{icon}</Text>
              <View className="flex-1 w-px bg-gray-200 dark:bg-slate-700" />
            </View>
            <View className="flex-1 gap-1 pb-4">
              <View className="flex-row items-center gap-2">
                <View className="bg-gray-100 dark:bg-slate-700 rounded px-1.5 py-0.5">
                  <Text className="text-xs text-gray-700 dark:text-slate-300 font-semibold">{humanizeLabel(item.actionType)}</Text>
                </View>
                <Text className="text-xs text-gray-400 dark:text-slate-500">{formatRelativeTime(item.timestamp)}</Text>
              </View>
              <Text className="text-sm text-gray-700 dark:text-slate-300 leading-5">{item.description}</Text>
              {item.task && (
                <TouchableOpacity onPress={() => router.push(`/task/${item.task!.id}`)}>
                  <Text className="text-xs text-blue-600 dark:text-blue-400">→ #{item.task.taskNumber} {item.task.title}</Text>
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
  if (fetching && history.length === 0) return <View className="flex-1 justify-center items-center gap-2"><ActivityIndicator color="#2563eb" /></View>;
  if (history.length === 0) return <View className="flex-1 justify-center items-center gap-2"><Text className="text-base text-gray-400 dark:text-slate-500">No status history</Text></View>;

  return (
    <FlatList
      style={{ flex: 1 }}
      data={history}
      keyExtractor={(h) => h.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      renderItem={({ item }) => (
        <View className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-200 dark:border-slate-700 gap-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm text-gray-500 dark:text-slate-400">
              {item.fromDetailedStatus ? humanizeLabel(item.fromDetailedStatus) : item.fromStatus ? humanizeLabel(item.fromStatus) : "—"}
            </Text>
            <Ionicons name="arrow-forward" size={12} color="#9ca3af" />
            <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              {item.toDetailedStatus ? humanizeLabel(item.toDetailedStatus) : humanizeLabel(item.toStatus)}
            </Text>
          </View>
          {item.statusMessage && <Text className="text-xs text-gray-500 dark:text-slate-400" numberOfLines={2}>{item.statusMessage}</Text>}
          <Text className="text-xs text-gray-400 dark:text-slate-500">{formatRelativeTime(item.timestamp)}</Text>
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

  if (loading) return <View className="flex-1 justify-center items-center gap-2"><ActivityIndicator color="#2563eb" /></View>;
  if (error) return <View className="flex-1 justify-center items-center gap-2"><Text className="text-base text-red-600 dark:text-red-400">{error}</Text></View>;
  if (!setup) return <View className="flex-1 justify-center items-center gap-2"><Text className="text-base text-gray-400 dark:text-slate-500">No setup data</Text></View>;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Mode toggle */}
      <View className="flex-row bg-gray-100 dark:bg-slate-700 rounded-xl p-1 gap-1">
        {(["auto", "manual"] as SetupMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            className={`flex-1 flex-row items-center justify-center gap-1 py-2 rounded-lg ${mode === m ? "bg-white dark:bg-slate-800" : ""}`}
            onPress={() => setMode(m)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={m === "auto" ? "send-outline" : "construct-outline"}
              size={14}
              color={mode === m ? "#2563eb" : "#6b7280"}
            />
            <Text className={`text-xs ${mode === m ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-gray-500 dark:text-slate-400 font-medium"}`}>
              {m === "auto" ? "Auto Setup" : "Manual Setup"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Security warning */}
      <View className="flex-row gap-2 bg-red-50 dark:bg-red-950/30 rounded-xl p-3 border border-red-200 dark:border-red-800">
        <Ionicons name="shield-outline" size={16} color="#dc2626" />
        <Text className="flex-1 text-xs text-red-600 dark:text-red-400 leading-4">
          These credentials grant full access to your system. Do not share publicly.
        </Text>
      </View>

      {/* API Key section */}
      {newApiKey ? (
        <View className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-3.5 border border-amber-200 dark:border-amber-700 gap-2">
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="warning-outline" size={16} color="#d97706" />
            <Text className="text-sm font-bold text-amber-600 dark:text-amber-400">New API Key — Save now!</Text>
            <TouchableOpacity
              onPress={() => {
                Clipboard.setString(newApiKey);
                Alert.alert("Copied", "API key copied to clipboard");
              }}
              className="flex-row items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 ml-auto"
              activeOpacity={0.7}
            >
              <Ionicons name="copy-outline" size={14} color="#2563eb" />
              <Text className="text-xs text-blue-600 dark:text-blue-400 font-semibold">Copy</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-xs text-amber-900 dark:text-amber-300">This key will only be shown once. It's embedded in the configs below.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <Text
              className="text-xs text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-800 p-2.5 rounded-md border border-amber-200 dark:border-amber-700"
              style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
              selectable
            >
              {newApiKey}
            </Text>
          </ScrollView>
        </View>
      ) : (
        <View className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 gap-2">
          <View className="flex-row items-start gap-2.5">
            <View className="flex-1">
              <Text className="text-sm font-bold text-gray-900 dark:text-slate-100">API Key</Text>
              <Text className="text-xs text-gray-400 dark:text-slate-500 mb-1">
                {setup.agent.apiKeyPrefix
                  ? `Current key: ${setup.agent.apiKeyPrefix}…`
                  : "No API key configured yet"}
              </Text>
              {!setup.agent.apiKeyPrefix && (
                <Text className="text-xs text-amber-600 dark:text-amber-400 mb-1">
                  Config files use $API_KEY placeholder. Regenerate to embed the real key.
                </Text>
              )}
            </View>
            <TouchableOpacity
              className="flex-row items-center gap-1 bg-red-50 dark:bg-red-950/30 rounded-lg px-2.5 py-2 border border-red-200 dark:border-red-800 shrink-0"
              style={{ opacity: regenerating ? 0.5 : 1 }}
              onPress={handleRegenerateKey}
              disabled={regenerating}
              activeOpacity={0.7}
            >
              {regenerating ? (
                <ActivityIndicator size="small" color="#dc2626" />
              ) : (
                <Ionicons name="key-outline" size={14} color="#dc2626" />
              )}
              <Text className="text-xs text-red-600 dark:text-red-400 font-semibold">
                {regenerating ? "Regenerating…" : "Regenerate"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Auto mode: bootstrap message ── */}
      {mode === "auto" && (
        <>
          <View className="flex-row gap-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
            <Ionicons name="chatbubble-outline" size={15} color="#2563eb" />
            <Text className="flex-1 text-xs text-blue-700 dark:text-blue-300 leading-4">
              Copy the message below and send it to your agent via any connected channel (WhatsApp, Slack, Discord, etc.)
            </Text>
          </View>

          {setup.bootstrapMessage ? (
            <View className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 gap-2">
              <View className="flex-row items-start gap-2.5">
                <Text className="text-sm font-bold text-gray-900 dark:text-slate-100">Bootstrap Message</Text>
                <TouchableOpacity
                  onPress={() => {
                    Clipboard.setString(setup.bootstrapMessage);
                    Alert.alert("Copied", "Bootstrap message copied to clipboard");
                  }}
                  className="flex-row items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 ml-auto"
                  activeOpacity={0.7}
                >
                  <Ionicons name="copy-outline" size={14} color="#2563eb" />
                  <Text className="text-xs text-blue-600 dark:text-blue-400 font-semibold">Copy</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                <Text
                  className="text-xs text-slate-200 leading-5"
                  style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                  selectable
                >
                  {setup.bootstrapMessage}
                </Text>
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
            <View className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 gap-2">
              <Text className="text-sm font-bold text-gray-900 dark:text-slate-100">1. Create Workspace</Text>
              <View className="bg-slate-800 rounded-lg p-3">
                <Text
                  className="text-xs text-slate-200 leading-5"
                  style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                  selectable
                >
                  mkdir -p {setup.workspacePath}
                </Text>
              </View>
            </View>
          )}

          {/* Config files */}
          {setup.configFiles.length > 0 && (
            <View className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 gap-2">
              <Text className="text-sm font-bold text-gray-900 dark:text-slate-100">2. Config Files ({setup.configFiles.length})</Text>
              <Text className="text-xs text-gray-400 dark:text-slate-500 mb-1">
                Extract to{" "}
                <Text style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
                  {setup.workspacePath}/
                </Text>
              </Text>
              {setup.configFiles.map((file) => (
                <View key={file.filename} className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <TouchableOpacity
                    className="flex-row items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-700"
                    onPress={() => setExpanded(expanded === file.filename ? null : file.filename)}
                    activeOpacity={0.7}
                  >
                    <Text className="text-xs text-gray-700 dark:text-slate-300 font-medium flex-1" numberOfLines={1}>{file.filename}</Text>
                    <Ionicons
                      name={expanded === file.filename ? "chevron-up" : "chevron-down"}
                      size={16}
                      color="#6b7280"
                    />
                  </TouchableOpacity>
                  {expanded === file.filename && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator
                      className="bg-slate-800 max-h-48"
                      nestedScrollEnabled
                    >
                      <Text
                        className="text-xs text-slate-200 leading-5"
                        style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                        selectable
                      >
                        {file.content}
                      </Text>
                    </ScrollView>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Cron command */}
          {setup.cronCommand && (
            <View className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 gap-2">
              <View className="flex-row items-start gap-2.5">
                <Text className="text-sm font-bold text-gray-900 dark:text-slate-100">3. Heartbeat Cron</Text>
                <TouchableOpacity
                  onPress={() => {
                    Clipboard.setString(setup.cronCommand);
                    Alert.alert("Copied", "Cron command copied to clipboard");
                  }}
                  className="flex-row items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 ml-auto"
                  activeOpacity={0.7}
                >
                  <Ionicons name="copy-outline" size={14} color="#2563eb" />
                  <Text className="text-xs text-blue-600 dark:text-blue-400 font-semibold">Copy</Text>
                </TouchableOpacity>
              </View>
              <Text className="text-xs text-gray-400 dark:text-slate-500 mb-1">Add this to your crontab to keep the agent running</Text>
              <View className="bg-slate-800 rounded-lg p-3">
                <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
                  <Text
                    className="text-xs text-slate-200 leading-5"
                    style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                    selectable
                  >
                    {setup.cronCommand}
                  </Text>
                </ScrollView>
              </View>
            </View>
          )}
        </>
      )}

      {/* Cloud VMs shortcut */}
      {setup.cloudVms.length > 0 && (
        <TouchableOpacity
          className="flex-row items-center gap-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3.5 border border-blue-200 dark:border-blue-800"
          onPress={() => router.push("/cloud")}
          activeOpacity={0.7}
        >
          <Ionicons name="server-outline" size={16} color="#2563eb" />
          <Text className="flex-1 text-sm text-blue-600 dark:text-blue-400 font-medium">
            {setup.cloudVms.length} Cloud VM{setup.cloudVms.length !== 1 ? "s" : ""} available — Deploy to VM
          </Text>
          <Ionicons name="arrow-forward" size={14} color="#2563eb" />
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
