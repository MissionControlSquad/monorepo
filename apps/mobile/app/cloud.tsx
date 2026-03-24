import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
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
import { useEffect, useState, useCallback, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/context/AuthContext";
import { getStoredCookie } from "../src/api/session";
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
      const cookie = getStoredCookie();
      const res = await fetch(`${serverUrl}/api/cloud-vms`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: `mc_session=${cookie}` } : {}),
        },
        body: JSON.stringify({ name: name.trim(), serverType, region }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error || `HTTP ${res.status}`);
      }

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
        style={{ flex: 1, backgroundColor: "#f9fafb" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[cmStyles.header, { paddingTop: insets.top || 16 }]}>
          <Text style={cmStyles.title}>Create Cloud VM</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={cmStyles.cancelBtn}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[cmStyles.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          <View style={cmStyles.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color="#2563eb" />
            <Text style={cmStyles.infoText}>
              A cloud VM will be provisioned and configured to run OpenClaw agents. You can deploy agents to it after it's running.
            </Text>
          </View>

          <View style={cmStyles.field}>
            <Text style={cmStyles.label}>VM Name <Text style={{ color: "#dc2626" }}>*</Text></Text>
            <TextInput
              style={cmStyles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. production-vm-1"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={cmStyles.field}>
            <Text style={cmStyles.label}>Server Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {SERVER_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[cmStyles.chip, serverType === t && cmStyles.chipActive]}
                  onPress={() => setServerType(t)}
                  activeOpacity={0.7}
                >
                  <Text style={[cmStyles.chipText, serverType === t && cmStyles.chipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={cmStyles.field}>
            <Text style={cmStyles.label}>Region</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {REGIONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[cmStyles.chip, region === r && cmStyles.chipActive]}
                  onPress={() => setRegion(r)}
                  activeOpacity={0.7}
                >
                  <Text style={[cmStyles.chipText, region === r && cmStyles.chipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <TouchableOpacity
            style={[cmStyles.createBtn, creating && { opacity: 0.5 }]}
            onPress={handleCreate}
            disabled={creating}
            activeOpacity={0.8}
          >
            {creating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={cmStyles.createBtnText}>Create VM</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const cmStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: { fontSize: 17, fontWeight: "700", color: "#111827" },
  cancelBtn: { fontSize: 16, color: "#6b7280" },
  content: { padding: 16, gap: 16 },
  infoBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  infoText: { flex: 1, fontSize: 13, color: "#1d4ed8", lineHeight: 18 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: "#111827",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#dbeafe", borderColor: "#2563eb" },
  chipText: { fontSize: 13, color: "#374151", fontWeight: "500" },
  chipTextActive: { color: "#2563eb", fontWeight: "600" },
  createBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  createBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

// ── VM Card ───────────────────────────────────────────────────────────────────

function VMCard({ vm, onPress }: { vm: CloudVM; onPress: () => void }) {
  const statusColor = STATUS_HEX_COLORS[vm.status] ?? DEFAULT_COLOR;
  const statusLabel = STATUS_LABELS[vm.status] ?? vm.status;
  const displayName = vm.name || vm.serverName || vm.id.slice(0, 8);

  return (
    <TouchableOpacity style={styles.vmCard} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.vmCardTop}>
        <View style={styles.vmNameRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.vmName} numberOfLines={1}>{displayName}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      <View style={styles.vmMeta}>
        {vm.ipv4 ? (
          <View style={styles.metaItem}>
            <Ionicons name="globe-outline" size={12} color="#9ca3af" />
            <Text style={styles.metaText}>{vm.ipv4}</Text>
          </View>
        ) : null}
        <View style={styles.metaItem}>
          <Ionicons name="hardware-chip-outline" size={12} color="#9ca3af" />
          <Text style={styles.metaText}>{vm.serverType} / {vm.region}</Text>
        </View>
        {vm.totalUptimeSeconds > 0 ? (
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={12} color="#9ca3af" />
            <Text style={styles.metaText}>{formatUptime(vm.totalUptimeSeconds)}</Text>
          </View>
        ) : null}
        {vm.estimatedCostCents > 0 ? (
          <View style={styles.metaItem}>
            <Ionicons name="cash-outline" size={12} color="#9ca3af" />
            <Text style={styles.metaText}>{formatCost(vm.estimatedCostCents)}</Text>
          </View>
        ) : null}
      </View>

      {vm.agents.length > 0 && (
        <View style={styles.agentsRow}>
          {vm.agents.slice(0, 5).map((a) => (
            <View key={a.id} style={styles.agentChip}>
              <Text style={styles.agentEmoji}>{a.identityEmoji || DEFAULT_AGENT_EMOJI}</Text>
            </View>
          ))}
          {vm.agents.length > 5 && (
            <Text style={styles.moreAgents}>+{vm.agents.length - 5}</Text>
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
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchVMs = useCallback(async (silent = false) => {
    if (!serverUrl) return;
    if (!silent) setLoading(true);
    try {
      const cookie = getStoredCookie();
      const res = await fetch(`${serverUrl}/api/cloud-vms`, {
        credentials: "include",
        headers: cookie ? { Cookie: `mc_session=${cookie}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setVMs(data.vms || []);
      }
    } catch {
      // ignore
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

  // Poll while any VM is transitional
  useEffect(() => {
    const hasTransitional = vms.some((vm) => TRANSITIONAL.includes(vm.status));
    if (pollRef.current) clearInterval(pollRef.current);
    if (hasTransitional) {
      pollRef.current = setInterval(() => fetchVMs(true), 5000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [vms, fetchVMs]);

  const filtered = search.trim()
    ? vms.filter((vm) => {
        const q = search.toLowerCase();
        const name = (vm.name || vm.serverName || vm.id).toLowerCase();
        return (
          name.includes(q) ||
          (vm.ipv4 || "").includes(q) ||
          vm.region.toLowerCase().includes(q) ||
          vm.status.toLowerCase().includes(q) ||
          vm.agents.some((a) => a.name.toLowerCase().includes(q))
        );
      })
    : vms;

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search VMs…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            filtered.length === 0 && styles.emptyContainer,
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
            <View style={styles.emptyBox}>
              <Ionicons name="server-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyTitle}>
                {search.trim() ? "No matching VMs" : "No cloud VMs yet"}
              </Text>
              {!search.trim() && (
                <Text style={styles.emptySubtitle}>
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
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: "#111827", paddingVertical: 6 },

  listContent: { padding: 12, gap: 10 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyBox: { alignItems: "center", gap: 10, padding: 32 },
  emptyTitle: { fontSize: 17, fontWeight: "600", color: "#374151" },
  emptySubtitle: { fontSize: 14, color: "#9ca3af", textAlign: "center" },

  vmCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 10,
  },
  vmCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  vmNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  vmName: { fontSize: 15, fontWeight: "600", color: "#111827", flex: 1 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: "600" },

  vmMeta: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, color: "#6b7280" },

  agentsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  agentChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  agentEmoji: { fontSize: 14 },
  moreAgents: { fontSize: 12, color: "#6b7280" },

  fab: {
    position: "absolute",
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
});
