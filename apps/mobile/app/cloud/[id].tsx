import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
  Modal,
  Platform,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/context/AuthContext";
import { getStoredCookie } from "../../src/api/session";
import { STATUS_HEX_COLORS } from "@agentcenter/utils";

interface VMAgent {
  id: string;
  name: string;
  identityEmoji?: string | null;
  status: string;
  username?: string | null;
}

interface CloudVM {
  id: string;
  name?: string | null;
  serverName?: string | null;
  status: string;
  ipv4?: string | null;
  region: string;
  serverType: string;
  totalUptimeSeconds: number;
  estimatedCostCents: number;
  errorMessage?: string | null;
  setupStep?: string | null;
  setupProgress?: number | null;
  llmConfigured: boolean;
  llmProvider?: string | null;
  llmModel?: string | null;
  agents: VMAgent[];
  createdAt: string;
}

interface VMLog {
  id: string;
  message: string;
  level: string;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  provisioning: "Provisioning",
  waiting_for_ssh: "Waiting for SSH",
  installing_deps: "Installing Deps",
  installing_openclaw: "Installing OpenClaw",
  configuring: "Configuring",
  starting_service: "Starting Service",
  running: "Running",
  stopped: "Stopped",
  error: "Error",
  destroying: "Destroying",
  destroyed: "Destroyed",
};

const AGENT_STATUS_COLORS: Record<string, string> = {
  online: "#16a34a",
  busy: "#d97706",
  offline: "#6b7280",
  error: "#dc2626",
};

const TRANSITIONAL = [
  "provisioning", "waiting_for_ssh", "installing_deps",
  "installing_openclaw", "configuring", "starting_service", "destroying",
];

function formatUptime(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} selectable>{value}</Text>
    </View>
  );
}

// ── Rename Modal ──────────────────────────────────────────────────────────────

function RenameModal({ visible, currentName, onClose, onSave }: {
  visible: boolean;
  currentName: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(currentName);
  useEffect(() => { if (visible) setName(currentName); }, [visible, currentName]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={rnStyles.overlay}>
        <View style={rnStyles.box}>
          <Text style={rnStyles.title}>Rename VM</Text>
          <TextInput
            style={rnStyles.input}
            value={name}
            onChangeText={setName}
            placeholder="VM name"
            placeholderTextColor="#9ca3af"
            autoFocus
          />
          <View style={rnStyles.btnRow}>
            <TouchableOpacity style={rnStyles.cancelBtn} onPress={onClose}>
              <Text style={rnStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={rnStyles.saveBtn}
              onPress={() => { if (name.trim()) { onSave(name.trim()); onClose(); } }}
            >
              <Text style={rnStyles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const rnStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  box: { backgroundColor: "#fff", borderRadius: 14, padding: 20, gap: 14 },
  title: { fontSize: 16, fontWeight: "700", color: "#111827" },
  input: {
    backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb",
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: "#111827",
  },
  btnRow: { flexDirection: "row", gap: 10 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  cancelText: { fontSize: 15, color: "#6b7280", fontWeight: "500" },
  saveBtn: { flex: 1, backgroundColor: "#2563eb", borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  saveText: { fontSize: 15, color: "#fff", fontWeight: "600" },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CloudVMDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { serverUrl } = useAuth();
  const insets = useSafeAreaInsets();

  const [vm, setVM] = useState<CloudVM | null>(null);
  const [logs, setLogs] = useState<VMLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showRename, setShowRename] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doRequest = useCallback(async (path: string, opts: RequestInit = {}) => {
    if (!serverUrl) throw new Error("No server URL");
    const cookie = getStoredCookie();
    return fetch(`${serverUrl}${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: `mc_session=${cookie}` } : {}),
        ...(opts.headers || {}),
      },
      ...opts,
    });
  }, [serverUrl]);

  const fetchVM = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await doRequest(`/api/cloud-vms/${id}`);
      if (res.ok) {
        const data = await res.json();
        setVM(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, doRequest]);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await doRequest(`/api/cloud-vms/${id}/logs?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch {
      // ignore
    }
  }, [id, doRequest]);

  useEffect(() => { fetchVM(); }, [fetchVM]);

  useEffect(() => {
    if (vm) {
      const displayName = vm.name || vm.serverName || vm.id.slice(0, 8);
      navigation.setOptions({ title: displayName });
      if (TRANSITIONAL.includes(vm.status)) setShowLogs(true);
    }
  }, [vm, navigation]);

  useEffect(() => {
    if (showLogs) fetchLogs();
  }, [showLogs, fetchLogs]);

  // Poll while transitional
  useEffect(() => {
    if (!vm) return;
    const isTransitional = TRANSITIONAL.includes(vm.status);
    if (pollRef.current) clearInterval(pollRef.current);
    if (isTransitional) {
      pollRef.current = setInterval(() => {
        fetchVM(true);
        if (showLogs) fetchLogs();
      }, 5000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [vm, showLogs, fetchVM, fetchLogs]);

  const handleAction = async (action: string, method = "POST", body?: object) => {
    setActionLoading(action);
    try {
      const res = await doRequest(`/api/cloud-vms/${id}/${action}`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error || `HTTP ${res.status}`);
      }
      await fetchVM(true);
    } catch (err) {
      Alert.alert("Error", (err as Error).message || "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDestroy = () => {
    Alert.alert(
      "Destroy VM",
      "This will permanently destroy the VM and all its data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Destroy",
          style: "destructive",
          onPress: async () => {
            setActionLoading("destroy");
            try {
              const res = await doRequest(`/api/cloud-vms/${id}`, { method: "DELETE" });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error((data as any).error || "Failed to destroy VM");
              }
              router.back();
            } catch (err) {
              Alert.alert("Error", (err as Error).message || "Failed to destroy VM");
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleRename = async (newName: string) => {
    try {
      const res = await doRequest(`/api/cloud-vms/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error("Failed to rename");
      await fetchVM(true);
    } catch (err) {
      Alert.alert("Error", (err as Error).message || "Failed to rename VM");
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!vm) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>VM not found</Text>
      </View>
    );
  }

  const statusColor = STATUS_HEX_COLORS[vm.status] ?? "#6b7280";
  const statusLabel = STATUS_LABELS[vm.status] ?? vm.status;
  const displayName = vm.name || vm.serverName || vm.id.slice(0, 8);
  const isRunning = vm.status === "running";
  const isStopped = vm.status === "stopped";
  const isError = vm.status === "error";
  const isTransitional = TRANSITIONAL.includes(vm.status);
  const isDestroyed = vm.status === "destroyed";

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchVM(); if (showLogs) fetchLogs(); }}
            tintColor="#2563eb"
          />
        }
      >
        {/* Status header */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            {isTransitional && <ActivityIndicator size="small" color={statusColor} style={{ marginLeft: 4 }} />}
          </View>

          {vm.setupStep && (
            <Text style={styles.setupStep}>{vm.setupStep.replace(/_/g, " ")}</Text>
          )}

          {vm.setupProgress != null && vm.setupProgress > 0 && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${Math.min(vm.setupProgress, 100)}%` as any, backgroundColor: statusColor }]} />
            </View>
          )}

          {vm.errorMessage && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={14} color="#dc2626" />
              <Text style={styles.errorMsg}>{vm.errorMessage}</Text>
            </View>
          )}
        </View>

        {/* VM Info */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardHeader}>
            <Text style={styles.cardTitle}>VM Details</Text>
            <TouchableOpacity onPress={() => setShowRename(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="pencil-outline" size={16} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <InfoRow label="Name" value={displayName} />
          {vm.ipv4 && <InfoRow label="IP Address" value={vm.ipv4} />}
          <InfoRow label="Server Type" value={vm.serverType} />
          <InfoRow label="Region" value={vm.region} />
          {vm.totalUptimeSeconds > 0 && <InfoRow label="Uptime" value={formatUptime(vm.totalUptimeSeconds)} />}
          {vm.estimatedCostCents > 0 && <InfoRow label="Est. Cost" value={formatCost(vm.estimatedCostCents)} />}
          <InfoRow label="Created" value={formatDate(vm.createdAt)} />
          {vm.llmProvider && <InfoRow label="LLM Provider" value={vm.llmProvider} />}
          {vm.llmModel && <InfoRow label="LLM Model" value={vm.llmModel} />}
        </View>

        {/* Actions */}
        {!isDestroyed && (
          <View style={styles.actionsCard}>
            <Text style={styles.cardTitle}>Actions</Text>
            <View style={styles.actionsRow}>
              {isRunning && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnWarning]}
                  onPress={() => handleAction("stop")}
                  disabled={!!actionLoading}
                  activeOpacity={0.7}
                >
                  {actionLoading === "stop" ? (
                    <ActivityIndicator size="small" color="#d97706" />
                  ) : (
                    <Ionicons name="stop-circle-outline" size={18} color="#d97706" />
                  )}
                  <Text style={[styles.actionBtnText, { color: "#d97706" }]}>Stop</Text>
                </TouchableOpacity>
              )}

              {isStopped && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnSuccess]}
                  onPress={() => handleAction("start")}
                  disabled={!!actionLoading}
                  activeOpacity={0.7}
                >
                  {actionLoading === "start" ? (
                    <ActivityIndicator size="small" color="#16a34a" />
                  ) : (
                    <Ionicons name="play-circle-outline" size={18} color="#16a34a" />
                  )}
                  <Text style={[styles.actionBtnText, { color: "#16a34a" }]}>Start</Text>
                </TouchableOpacity>
              )}

              {(isRunning || isStopped) && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnDefault]}
                  onPress={() => handleAction("restart")}
                  disabled={!!actionLoading}
                  activeOpacity={0.7}
                >
                  {actionLoading === "restart" ? (
                    <ActivityIndicator size="small" color="#374151" />
                  ) : (
                    <Ionicons name="refresh-outline" size={18} color="#374151" />
                  )}
                  <Text style={[styles.actionBtnText, { color: "#374151" }]}>Restart</Text>
                </TouchableOpacity>
              )}

              {isError && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnDefault]}
                  onPress={() => {
                    Alert.alert(
                      "Retry Provisioning",
                      "This will re-attempt the provisioning process for this VM.",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Retry", onPress: () => handleAction("retry") },
                      ]
                    );
                  }}
                  disabled={!!actionLoading}
                  activeOpacity={0.7}
                >
                  {actionLoading === "retry" ? (
                    <ActivityIndicator size="small" color="#374151" />
                  ) : (
                    <Ionicons name="reload-outline" size={18} color="#374151" />
                  )}
                  <Text style={[styles.actionBtnText, { color: "#374151" }]}>Retry</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnDanger]}
                onPress={handleDestroy}
                disabled={!!actionLoading || isTransitional}
                activeOpacity={0.7}
              >
                {actionLoading === "destroy" ? (
                  <ActivityIndicator size="small" color="#dc2626" />
                ) : (
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                )}
                <Text style={[styles.actionBtnText, { color: "#dc2626" }]}>Destroy</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Agents */}
        {vm.agents.length > 0 && (
          <View style={styles.agentsCard}>
            <Text style={styles.cardTitle}>Agents ({vm.agents.length})</Text>
            {vm.agents.map((agent) => {
              const agentStatusColor = AGENT_STATUS_HEX_COLORS[agent.status] ?? "#6b7280";
              return (
                <TouchableOpacity
                  key={agent.id}
                  style={styles.agentRow}
                  onPress={() => router.push(`/agent/${agent.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.agentEmoji}>
                    <Text style={styles.agentEmojiText}>{agent.identityEmoji || "🤖"}</Text>
                  </View>
                  <View style={styles.agentInfo}>
                    <Text style={styles.agentName}>{agent.name}</Text>
                    {agent.username && <Text style={styles.agentUsername}>@{agent.username}</Text>}
                  </View>
                  <View style={[styles.agentStatusDot, { backgroundColor: agentStatusColor }]} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* VM Logs */}
        <TouchableOpacity
          style={styles.logsToggle}
          onPress={() => {
            setShowLogs((v) => !v);
            if (!showLogs) fetchLogs();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="terminal-outline" size={16} color="#374151" />
          <Text style={styles.logsToggleText}>Setup Logs</Text>
          <Ionicons name={showLogs ? "chevron-up" : "chevron-down"} size={16} color="#6b7280" style={{ marginLeft: "auto" }} />
        </TouchableOpacity>

        {showLogs && (
          <View style={styles.logsCard}>
            {logs.length === 0 ? (
              <Text style={styles.logsEmpty}>No logs yet</Text>
            ) : (
              logs.map((log) => (
                <View key={log.id} style={styles.logLine}>
                  <Text style={[styles.logLevel, {
                    color: log.level === "error" ? "#dc2626" : log.level === "warn" ? "#d97706" : "#6b7280"
                  }]}>
                    [{log.level.toUpperCase()}]
                  </Text>
                  <Text style={styles.logMsg} selectable>{log.message}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <RenameModal
        visible={showRename}
        currentName={displayName}
        onClose={() => setShowRename(false)}
        onSave={handleRename}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { fontSize: 16, color: "#dc2626" },

  statusCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 15, fontWeight: "700" },
  setupStep: { fontSize: 13, color: "#6b7280", textTransform: "capitalize" },
  progressBar: {
    height: 4,
    backgroundColor: "#f3f4f6",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 2 },
  errorBox: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorMsg: { flex: 1, fontSize: 12, color: "#dc2626" },

  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 10,
  },
  infoCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  infoLabel: { fontSize: 13, color: "#6b7280" },
  infoValue: { fontSize: 13, color: "#111827", fontWeight: "500", textAlign: "right", flex: 1 },

  actionsCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 12,
  },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnDefault: { borderColor: "#e5e7eb", backgroundColor: "#f9fafb" },
  actionBtnWarning: { borderColor: "#fde68a", backgroundColor: "#fffbeb" },
  actionBtnSuccess: { borderColor: "#bbf7d0", backgroundColor: "#f0fdf4" },
  actionBtnDanger: { borderColor: "#fecaca", backgroundColor: "#fef2f2" },
  actionBtnText: { fontSize: 13, fontWeight: "600" },

  agentsCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 10,
  },
  agentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  agentEmoji: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  agentEmojiText: { fontSize: 18 },
  agentInfo: { flex: 1 },
  agentName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  agentUsername: { fontSize: 12, color: "#6b7280" },
  agentStatusDot: { width: 8, height: 8, borderRadius: 4 },

  logsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  logsToggleText: { fontSize: 14, fontWeight: "500", color: "#374151" },

  logsCard: {
    backgroundColor: "#1e1e2e",
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  logsEmpty: { color: "#6b7280", fontSize: 13, textAlign: "center", padding: 16 },
  logLine: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  logLevel: { fontSize: 11, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", flexShrink: 0 },
  logMsg: {
    flex: 1,
    fontSize: 11,
    color: "#e2e8f0",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 16,
  },
});
