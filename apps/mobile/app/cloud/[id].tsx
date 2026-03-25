import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
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
import { makeRequest } from "../../src/api/request";
import { STATUS_HEX_COLORS, DEFAULT_COLOR, DEFAULT_AGENT_EMOJI, formatUptime, formatCost, formatDate, CLOUD_VM_STATUS_LABELS, CLOUD_VM_TRANSITIONAL_STATUSES } from "@agentcenter/utils";

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

const STATUS_LABELS = CLOUD_VM_STATUS_LABELS;
const TRANSITIONAL = CLOUD_VM_TRANSITIONAL_STATUSES;

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text className="text-[13px] text-gray-500 dark:text-slate-400">{label}</Text>
      <Text className="text-[13px] text-gray-900 dark:text-slate-100 font-medium text-right flex-1" selectable>{value}</Text>
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
      <View className="flex-1 justify-center p-6" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
        <View className="bg-white dark:bg-slate-800 rounded-[14px] p-5 gap-3.5">
          <Text className="text-base font-bold text-gray-900 dark:text-slate-100">Rename VM</Text>
          <TextInput
            className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-[10px] px-3.5 py-[11px] text-[15px] text-gray-900 dark:text-slate-100"
            value={name}
            onChangeText={setName}
            placeholder="VM name"
            placeholderTextColor="#9ca3af"
            autoFocus
          />
          <View className="flex-row gap-2.5">
            <TouchableOpacity
              className="flex-1 border border-gray-200 dark:border-slate-600 rounded-[10px] py-[11px] items-center"
              onPress={onClose}
            >
              <Text className="text-[15px] text-gray-500 dark:text-slate-400 font-medium">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-blue-600 rounded-[10px] py-[11px] items-center"
              onPress={() => { if (name.trim()) { onSave(name.trim()); onClose(); } }}
            >
              <Text className="text-[15px] text-white font-semibold">Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

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

  const doRequest = useCallback(<T = unknown>(path: string, opts: Parameters<typeof makeRequest>[2] = {}) => {
    if (!serverUrl) throw new Error("No server URL");
    return makeRequest<T>(serverUrl, path, opts);
  }, [serverUrl]);

  const fetchVM = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await doRequest<CloudVM>(`/api/cloud-vms/${id}`);
      setVM(data);
    } catch {
      // silent failure on background polls; initial load shows loading state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, doRequest]);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await doRequest<{ logs: VMLog[] }>(`/api/cloud-vms/${id}/logs?limit=50`);
      setLogs(data.logs ?? []);
    } catch {
      // ignore — logs are supplementary
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
      await doRequest(`/api/cloud-vms/${id}/${action}`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
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
              await doRequest(`/api/cloud-vms/${id}`, { method: "DELETE" });
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
      await doRequest(`/api/cloud-vms/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: newName }),
      });
      await fetchVM(true);
    } catch (err) {
      Alert.alert("Error", (err as Error).message || "Failed to rename VM");
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!vm) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900">
        <Text className="text-base text-red-600 dark:text-red-400">VM not found</Text>
      </View>
    );
  }

  const statusColor = STATUS_HEX_COLORS[vm.status] ?? DEFAULT_COLOR;
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
        className="flex-1 bg-gray-50 dark:bg-slate-900"
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
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
        <View className="bg-white dark:bg-slate-800 rounded-[12px] p-4 border border-gray-200 dark:border-slate-700 gap-2">
          <View className="flex-row items-center gap-2">
            <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColor }} />
            <Text className="text-[15px] font-bold" style={{ color: statusColor }}>{statusLabel}</Text>
            {isTransitional && <ActivityIndicator size="small" color={statusColor} style={{ marginLeft: 4 }} />}
          </View>

          {vm.setupStep && (
            <Text className="text-[13px] text-gray-500 dark:text-slate-400 capitalize">{vm.setupStep.replace(/_/g, " ")}</Text>
          )}

          {vm.setupProgress != null && vm.setupProgress > 0 && (
            <View className="h-1 bg-gray-100 dark:bg-slate-700 rounded-[2px] overflow-hidden">
              <View
                className="h-full rounded-[2px]"
                style={{ width: `${Math.min(vm.setupProgress, 100)}%` as any, backgroundColor: statusColor }}
              />
            </View>
          )}

          {vm.errorMessage && (
            <View className="flex-row gap-1.5 bg-red-50 dark:bg-red-900/20 rounded-lg p-2.5 border border-red-200 dark:border-red-700">
              <Ionicons name="alert-circle-outline" size={14} color="#dc2626" />
              <Text className="flex-1 text-[12px] text-red-600 dark:text-red-400">{vm.errorMessage}</Text>
            </View>
          )}
        </View>

        {/* VM Info */}
        <View className="bg-white dark:bg-slate-800 rounded-[12px] p-4 border border-gray-200 dark:border-slate-700 gap-2.5">
          <View className="flex-row justify-between items-center">
            <Text className="text-[14px] font-bold text-gray-900 dark:text-slate-100">VM Details</Text>
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
          <View className="bg-white dark:bg-slate-800 rounded-[12px] p-4 border border-gray-200 dark:border-slate-700 gap-3">
            <Text className="text-[14px] font-bold text-gray-900 dark:text-slate-100">Actions</Text>
            <View className="flex-row flex-wrap gap-2.5">
              {isRunning && (
                <TouchableOpacity
                  className="flex-row items-center gap-1.5 px-3.5 py-[9px] rounded-[10px] border border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20"
                  onPress={() => handleAction("stop")}
                  disabled={!!actionLoading}
                  activeOpacity={0.7}
                >
                  {actionLoading === "stop" ? (
                    <ActivityIndicator size="small" color="#d97706" />
                  ) : (
                    <Ionicons name="stop-circle-outline" size={18} color="#d97706" />
                  )}
                  <Text className="text-[13px] font-semibold text-yellow-600 dark:text-yellow-400">Stop</Text>
                </TouchableOpacity>
              )}

              {isStopped && (
                <TouchableOpacity
                  className="flex-row items-center gap-1.5 px-3.5 py-[9px] rounded-[10px] border border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
                  onPress={() => handleAction("start")}
                  disabled={!!actionLoading}
                  activeOpacity={0.7}
                >
                  {actionLoading === "start" ? (
                    <ActivityIndicator size="small" color="#16a34a" />
                  ) : (
                    <Ionicons name="play-circle-outline" size={18} color="#16a34a" />
                  )}
                  <Text className="text-[13px] font-semibold text-green-600 dark:text-green-400">Start</Text>
                </TouchableOpacity>
              )}

              {(isRunning || isStopped) && (
                <TouchableOpacity
                  className="flex-row items-center gap-1.5 px-3.5 py-[9px] rounded-[10px] border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700"
                  onPress={() => handleAction("restart")}
                  disabled={!!actionLoading}
                  activeOpacity={0.7}
                >
                  {actionLoading === "restart" ? (
                    <ActivityIndicator size="small" color="#374151" />
                  ) : (
                    <Ionicons name="refresh-outline" size={18} color="#374151" />
                  )}
                  <Text className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">Restart</Text>
                </TouchableOpacity>
              )}

              {isError && (
                <TouchableOpacity
                  className="flex-row items-center gap-1.5 px-3.5 py-[9px] rounded-[10px] border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700"
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
                  <Text className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">Retry</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                className="flex-row items-center gap-1.5 px-3.5 py-[9px] rounded-[10px] border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20"
                onPress={handleDestroy}
                disabled={!!actionLoading || isTransitional}
                activeOpacity={0.7}
              >
                {actionLoading === "destroy" ? (
                  <ActivityIndicator size="small" color="#dc2626" />
                ) : (
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                )}
                <Text className="text-[13px] font-semibold text-red-600 dark:text-red-400">Destroy</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Agents */}
        {vm.agents.length > 0 && (
          <View className="bg-white dark:bg-slate-800 rounded-[12px] p-4 border border-gray-200 dark:border-slate-700 gap-2.5">
            <Text className="text-[14px] font-bold text-gray-900 dark:text-slate-100">Agents ({vm.agents.length})</Text>
            {vm.agents.map((agent) => {
              const agentStatusColor = STATUS_HEX_COLORS[agent.status] ?? DEFAULT_COLOR;
              return (
                <TouchableOpacity
                  key={agent.id}
                  className="flex-row items-center gap-3 py-1"
                  onPress={() => router.push(`/agent/${agent.id}`)}
                  activeOpacity={0.7}
                >
                  <View className="w-9 h-9 rounded-full bg-gray-100 dark:bg-slate-700 justify-center items-center">
                    <Text className="text-[18px]">{agent.identityEmoji || DEFAULT_AGENT_EMOJI}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[14px] font-semibold text-gray-900 dark:text-slate-100">{agent.name}</Text>
                    {agent.username && <Text className="text-[12px] text-gray-500 dark:text-slate-400">@{agent.username}</Text>}
                  </View>
                  <View className="w-2 h-2 rounded-full" style={{ backgroundColor: agentStatusColor }} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* VM Logs */}
        <TouchableOpacity
          className="flex-row items-center gap-2 bg-white dark:bg-slate-800 rounded-[12px] p-3.5 border border-gray-200 dark:border-slate-700"
          onPress={() => {
            setShowLogs((v) => !v);
            if (!showLogs) fetchLogs();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="terminal-outline" size={16} color="#374151" />
          <Text className="text-[14px] font-medium text-gray-700 dark:text-slate-300">Setup Logs</Text>
          <Ionicons name={showLogs ? "chevron-up" : "chevron-down"} size={16} color="#6b7280" style={{ marginLeft: "auto" }} />
        </TouchableOpacity>

        {showLogs && (
          <View className="bg-slate-900 rounded-[12px] p-3 gap-1.5">
            {logs.length === 0 ? (
              <Text className="text-gray-500 text-[13px] text-center py-4">No logs yet</Text>
            ) : (
              logs.map((log) => (
                <View key={log.id} className="flex-row gap-1.5 flex-wrap">
                  <Text
                    className="text-[11px] shrink-0"
                    style={{
                      color: log.level === "error" ? "#dc2626" : log.level === "warn" ? "#d97706" : "#6b7280",
                      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                    }}
                  >
                    [{log.level.toUpperCase()}]
                  </Text>
                  <Text
                    className="flex-1 text-[11px] text-slate-200 leading-4"
                    style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                    selectable
                  >
                    {log.message}
                  </Text>
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
