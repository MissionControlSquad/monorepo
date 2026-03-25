import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useState, useCallback } from "react";
import { usePollingInterval, useSearch } from "@agentcenter/hooks";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/context/AuthContext";
import { makeRequest, ApiError } from "../src/api/request";
import { STATUS_HEX_COLORS, DEFAULT_COLOR, DEFAULT_AGENT_EMOJI, formatUptime, formatCost, CLOUD_VM_STATUS_LABELS, CLOUD_VM_TRANSITIONAL_STATUSES } from "@agentcenter/utils";

interface CloudVMAgent {
  id: string;
  name: string;
  identityEmoji?: string | null;
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
  agents: CloudVMAgent[];
  createdAt: string;
}

const STATUS_LABELS = CLOUD_VM_STATUS_LABELS;
const TRANSITIONAL = CLOUD_VM_TRANSITIONAL_STATUSES;

// ── Create VM Modal ───────────────────────────────────────────────────────────

const SERVER_TYPES = ["cpx11", "cpx21", "cpx31", "cx22", "cx32"];
const REGIONS = ["ash", "hil", "sin", "fsn1", "nbg1", "hel1"];

function CreateVMModal({ visible, onClose, onCreated }: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { serverUrl } = useAuth();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [serverType, setServerType] = useState("cpx11");
  const [region, setRegion] = useState("ash");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Required", "VM name is required");
      return;
    }
    if (!serverUrl) return;

    setCreating(true);
    try {
      await makeRequest(serverUrl, "/api/cloud-vms", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), serverType, region }),
      });
      onCreated();
      onClose();
      setName("");
    } catch (err) {
      Alert.alert("Error", (err as Error).message || "Failed to create VM");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        className="flex-1 bg-gray-50 dark:bg-slate-900"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          className="flex-row justify-between items-center px-4 pb-3.5 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700"
          style={{ paddingTop: insets.top || 16 }}
        >
          <Text className="text-[17px] font-bold text-gray-900 dark:text-slate-100">Create Cloud VM</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text className="text-base text-gray-500 dark:text-slate-400">Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row gap-2 bg-blue-50 dark:bg-blue-900/30 rounded-[10px] p-3 border border-blue-200 dark:border-blue-700">
            <Ionicons name="information-circle-outline" size={16} color="#2563eb" />
            <Text className="flex-1 text-[13px] text-blue-700 dark:text-blue-300 leading-[18px]">
              A cloud VM will be provisioned and configured to run OpenClaw agents. You can deploy agents to it after it's running.
            </Text>
          </View>

          <View className="gap-2">
            <Text className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">
              VM Name <Text className="text-red-600 dark:text-red-400">*</Text>
            </Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-[10px] px-3.5 py-[11px] text-[15px] text-gray-900 dark:text-slate-100"
              value={name}
              onChangeText={setName}
              placeholder="e.g. production-vm-1"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View className="gap-2">
            <Text className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">Server Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {SERVER_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  className={`px-3.5 py-2 rounded-lg border ${
                    serverType === t
                      ? "bg-blue-100 dark:bg-blue-900/30 border-blue-500"
                      : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600"
                  }`}
                  onPress={() => setServerType(t)}
                  activeOpacity={0.7}
                >
                  <Text className={`text-[13px] font-medium ${
                    serverType === t ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-gray-700 dark:text-slate-300"
                  }`}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View className="gap-2">
            <Text className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">Region</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {REGIONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  className={`px-3.5 py-2 rounded-lg border ${
                    region === r
                      ? "bg-blue-100 dark:bg-blue-900/30 border-blue-500"
                      : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600"
                  }`}
                  onPress={() => setRegion(r)}
                  activeOpacity={0.7}
                >
                  <Text className={`text-[13px] font-medium ${
                    region === r ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-gray-700 dark:text-slate-300"
                  }`}>{r}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <TouchableOpacity
            className={`bg-blue-600 rounded-[12px] py-3.5 items-center mt-2 ${creating ? "opacity-50" : ""}`}
            onPress={handleCreate}
            disabled={creating}
            activeOpacity={0.8}
          >
            {creating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white text-base font-semibold">Create VM</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── VM Card ───────────────────────────────────────────────────────────────────

function VMCard({ vm, onPress }: { vm: CloudVM; onPress: () => void }) {
  const statusColor = STATUS_HEX_COLORS[vm.status] ?? DEFAULT_COLOR;
  const statusLabel = STATUS_LABELS[vm.status] ?? vm.status;
  const displayName = vm.name || vm.serverName || vm.id.slice(0, 8);

  return (
    <TouchableOpacity
      className="bg-white dark:bg-slate-800 rounded-[14px] p-3.5 border border-gray-200 dark:border-slate-700 gap-2.5"
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2 flex-1">
          <View className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
          <Text className="text-[15px] font-semibold text-gray-900 dark:text-slate-100 flex-1" numberOfLines={1}>{displayName}</Text>
        </View>
        <View className="rounded-[6px] px-2 py-[3px]" style={{ backgroundColor: statusColor + "18" }}>
          <Text className="text-[11px] font-semibold" style={{ color: statusColor }}>{statusLabel}</Text>
        </View>
      </View>

      <View className="flex-row flex-wrap gap-2.5">
        {vm.ipv4 ? (
          <View className="flex-row items-center gap-1">
            <Ionicons name="globe-outline" size={12} color="#9ca3af" />
            <Text className="text-[12px] text-gray-500 dark:text-slate-400">{vm.ipv4}</Text>
          </View>
        ) : null}
        <View className="flex-row items-center gap-1">
          <Ionicons name="hardware-chip-outline" size={12} color="#9ca3af" />
          <Text className="text-[12px] text-gray-500 dark:text-slate-400">{vm.serverType} / {vm.region}</Text>
        </View>
        {vm.totalUptimeSeconds > 0 ? (
          <View className="flex-row items-center gap-1">
            <Ionicons name="time-outline" size={12} color="#9ca3af" />
            <Text className="text-[12px] text-gray-500 dark:text-slate-400">{formatUptime(vm.totalUptimeSeconds)}</Text>
          </View>
        ) : null}
        {vm.estimatedCostCents > 0 ? (
          <View className="flex-row items-center gap-1">
            <Ionicons name="cash-outline" size={12} color="#9ca3af" />
            <Text className="text-[12px] text-gray-500 dark:text-slate-400">{formatCost(vm.estimatedCostCents)}</Text>
          </View>
        ) : null}
      </View>

      {vm.agents.length > 0 && (
        <View className="flex-row items-center gap-1.5">
          {vm.agents.slice(0, 5).map((a) => (
            <View
              key={a.id}
              className="w-7 h-7 rounded-full bg-gray-100 dark:bg-slate-700 justify-center items-center border border-gray-200 dark:border-slate-600"
            >
              <Text className="text-[14px]">{a.identityEmoji || DEFAULT_AGENT_EMOJI}</Text>
            </View>
          ))}
          {vm.agents.length > 5 && (
            <Text className="text-[12px] text-gray-500 dark:text-slate-400">+{vm.agents.length - 5}</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CloudVMsScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { serverUrl } = useAuth();
  const insets = useSafeAreaInsets();

  const [vms, setVMs] = useState<CloudVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchVMs = useCallback(async (silent = false) => {
    if (!serverUrl) return;
    if (!silent) setLoading(true);
    try {
      const data = await makeRequest<{ vms: CloudVM[] }>(serverUrl, "/api/cloud-vms");
      setVMs(data.vms ?? []);
      setFetchError(null);
    } catch (err) {
      if (!silent) setFetchError((err as Error).message || "Failed to load VMs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serverUrl]);

  useEffect(() => {
    navigation.setOptions({
      title: "Cloud VMs",
      headerRight: () => (
        <TouchableOpacity onPress={() => setShowCreate(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="add" size={24} color="#2563eb" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  useEffect(() => { fetchVMs(); }, [fetchVMs]);

  const fetchVMsSilent = useCallback(() => fetchVMs(true), [fetchVMs]);
  const hasTransitional = vms.some((vm) => TRANSITIONAL.includes(vm.status));
  usePollingInterval(fetchVMsSilent, 5000, hasTransitional);

  const { search, setSearch, filtered } = useSearch(vms, (vm, q) => {
    const name = (vm.name || vm.serverName || vm.id).toLowerCase();
    return (
      name.includes(q) ||
      (vm.ipv4 || "").includes(q) ||
      vm.region.toLowerCase().includes(q) ||
      vm.status.toLowerCase().includes(q) ||
      vm.agents.some((a) => a.name.toLowerCase().includes(q))
    );
  });

  return (
    <View className="flex-1 bg-gray-50 dark:bg-slate-900">
      {/* Search bar */}
      <View className="flex-row items-center bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 px-3 py-2 gap-2">
        <Ionicons name="search-outline" size={16} color="#9ca3af" />
        <TextInput
          className="flex-1 text-[15px] text-gray-900 dark:text-slate-100 py-1.5"
          placeholder="Search VMs…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <View className="flex-1 justify-center items-center gap-3 p-6">
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : fetchError ? (
        <View className="flex-1 justify-center items-center gap-3 p-6">
          <Ionicons name="cloud-offline-outline" size={40} color="#dc2626" />
          <Text className="text-[15px] text-red-600 dark:text-red-400 text-center">{fetchError}</Text>
          <TouchableOpacity
            className="px-5 py-2.5 bg-blue-600 rounded-lg"
            onPress={() => fetchVMs()}
          >
            <Text className="text-white font-semibold text-[14px]">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            { padding: 12, gap: 10 },
            filtered.length === 0 && { flex: 1, justifyContent: "center", alignItems: "center" },
            { paddingBottom: insets.bottom + 80 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchVMs(); }}
              tintColor="#2563eb"
            />
          }
          ListEmptyComponent={
            <View className="items-center gap-2.5 p-8">
              <Ionicons name="server-outline" size={48} color="#d1d5db" />
              <Text className="text-[17px] font-semibold text-gray-700 dark:text-slate-300">
                {search.trim() ? "No matching VMs" : "No cloud VMs yet"}
              </Text>
              {!search.trim() && (
                <Text className="text-[14px] text-gray-400 dark:text-slate-500 text-center">
                  Create a virtual machine to deploy agents to the cloud.
                </Text>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <VMCard vm={item} onPress={() => router.push(`/cloud/${item.id}`)} />
          )}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        className="absolute right-5 w-[52px] h-[52px] rounded-full bg-blue-600 justify-center items-center"
        style={{
          bottom: insets.bottom + 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.2,
          shadowRadius: 6,
          elevation: 6,
        }}
        onPress={() => setShowCreate(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      <CreateVMModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => fetchVMs()}
      />
    </View>
  );
}
