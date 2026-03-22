import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { useQuery } from "urql";
import { useRouter } from "expo-router";
import { useState, useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { AGENTS_QUERY } from "@agentcenter/graphql-client";

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
  upgradeAvailable: boolean;
  profile: { id: string; displayName: string; username: string; avatarUrl: string | null } | null;
}

type FilterTab = "all" | "active" | "pending" | "deactivated";

const FILTER_LABELS: Record<FilterTab, string> = {
  all: "All",
  active: "Active",
  pending: "Pending",
  deactivated: "Deactivated",
};

const STATUS_COLOR: Record<string, string> = {
  active: "#16a34a",
  idle: "#6b7280",
  blocked: "#dc2626",
};

const DETAILED_STATUS_COLOR: Record<string, string> = {
  thinking: "#7c3aed", coding: "#2563eb", reviewing: "#4f46e5",
  researching: "#d97706", deploying: "#ea580c", testing: "#0891b2",
  writing: "#059669", waiting_review: "#d97706", waiting_input: "#d97706",
  waiting_dependency: "#d97706",
};

function getStatusColor(agent: Agent): string {
  if (agent.detailedStatus && DETAILED_STATUS_COLOR[agent.detailedStatus]) {
    return DETAILED_STATUS_COLOR[agent.detailedStatus];
  }
  return STATUS_COLOR[agent.status] ?? "#6b7280";
}

function getStatusLabel(agent: Agent): string {
  if (agent.isOnVacation) return "On Vacation";
  if (agent.detailedStatus) return agent.detailedStatus.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return agent.status.charAt(0).toUpperCase() + agent.status.slice(1);
}

function isOnline(agent: Agent): boolean {
  if (!agent.lastHeartbeat) return false;
  return new Date(agent.lastHeartbeat).getTime() > Date.now() - 2 * 60 * 1000;
}

function filterAgents(agents: Agent[], tab: FilterTab, search: string): Agent[] {
  let list = agents;
  if (tab === "active") list = list.filter((a) => a.setupStatus === "ready");
  else if (tab === "pending") list = list.filter((a) => a.setupStatus === "pending" || a.setupStatus === "waiting");
  else if (tab === "deactivated") list = list.filter((a) => a.setupStatus === "deactivated");

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter((a) => a.name.toLowerCase().includes(q) || a.role.toLowerCase().includes(q));
  }
  return list;
}

export default function AgentsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  const [result, reexecute] = useQuery<{ agents: Agent[] }>({
    query: AGENTS_QUERY,
    requestPolicy: "cache-and-network",
  });

  const { data, fetching, error } = result;
  const allAgents = data?.agents ?? [];

  const filtered = useMemo(() => filterAgents(allAgents, filter, search), [allAgents, filter, search]);

  const counts = useMemo(() => ({
    all: allAgents.length,
    active: allAgents.filter((a) => a.setupStatus === "ready").length,
    pending: allAgents.filter((a) => a.setupStatus === "pending" || a.setupStatus === "waiting").length,
    deactivated: allAgents.filter((a) => a.setupStatus === "deactivated").length,
  }), [allAgents]);

  if (fetching && allAgents.length === 0) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  if (error && allAgents.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load agents</Text>
        <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search agents…"
          placeholderTextColor="#9ca3af"
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={16} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter tabs */}
      <View style={styles.filterBar}>
        {(["all", "active", "pending", "deactivated"] as FilterTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.filterTab, filter === tab && styles.filterTabActive]}
            onPress={() => setFilter(tab)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, filter === tab && styles.filterTabTextActive]}>
              {FILTER_LABELS[tab]}
            </Text>
            {counts[tab] > 0 && (
              <View style={[styles.filterCount, filter === tab && styles.filterCountActive]}>
                <Text style={[styles.filterCountText, filter === tab && styles.filterCountTextActive]}>
                  {counts[tab]}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={fetching} onRefresh={() => reexecute({ requestPolicy: "network-only" })} tintColor="#2563eb" />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {search ? "No agents match your search" : "No agents in this category"}
          </Text>
        }
        renderItem={({ item }) => {
          const online = isOnline(item);
          const statusColor = getStatusColor(item);
          const isPending = item.setupStatus === "pending" || item.setupStatus === "waiting";
          const isDeactivated = item.setupStatus === "deactivated";

          return (
            <TouchableOpacity
              style={[styles.card, isDeactivated && styles.cardMuted]}
              onPress={() => router.push(`/agent/${item.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.cardLeft}>
                <View style={styles.emojiContainer}>
                  <Text style={styles.emoji}>{item.identityEmoji ?? "🤖"}</Text>
                  <View style={[styles.statusDot, { backgroundColor: online ? statusColor : "#d1d5db" }]} />
                </View>
                <View style={styles.info}>
                  <View style={styles.nameRow}>
                    <Text style={styles.agentName}>{item.name}</Text>
                    {item.upgradeAvailable && (
                      <View style={styles.upgradeDot}>
                        <Text style={styles.upgradeDotText}>↑</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.agentRole}>{item.role}</Text>
                  {item.currentTask && !isDeactivated && (
                    <Text style={styles.currentTask} numberOfLines={1}>{item.currentTask}</Text>
                  )}
                  {isPending && (
                    <Text style={styles.pendingTag}>Needs setup</Text>
                  )}
                </View>
              </View>

              <View style={styles.cardRight}>
                {isDeactivated ? (
                  <View style={[styles.statusBadge, { backgroundColor: "#f3f4f6" }]}>
                    <Text style={[styles.statusText, { color: "#9ca3af" }]}>Deactivated</Text>
                  </View>
                ) : (
                  <View style={[styles.statusBadge, { backgroundColor: (online ? statusColor : "#6b7280") + "22" }]}>
                    <Text style={[styles.statusText, { color: online ? statusColor : "#6b7280" }]}>
                      {online ? getStatusLabel(item) : "Offline"}
                    </Text>
                  </View>
                )}
                <Text style={styles.levelText}>{item.level}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  errorText: { color: "#dc2626", fontSize: 16 },
  retryBtn: { marginTop: 4 },
  retryText: { color: "#2563eb", fontSize: 14, fontWeight: "600" },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: "#111827" },

  filterBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingHorizontal: 12,
  },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  filterTabActive: { borderBottomColor: "#2563eb" },
  filterTabText: { fontSize: 13, color: "#6b7280", fontWeight: "500" },
  filterTabTextActive: { color: "#2563eb", fontWeight: "600" },
  filterCount: {
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center",
  },
  filterCountActive: { backgroundColor: "#dbeafe" },
  filterCountText: { fontSize: 11, color: "#6b7280", fontWeight: "600" },
  filterCountTextActive: { color: "#2563eb" },

  listContent: { padding: 16, gap: 10 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { color: "#9ca3af", fontSize: 15, textAlign: "center" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  cardMuted: { opacity: 0.6 },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  emojiContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  emoji: { fontSize: 22 },
  statusDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#fff",
  },
  info: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  agentName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  upgradeDot: {
    backgroundColor: "#fef3c7",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  upgradeDotText: { fontSize: 10, color: "#d97706", fontWeight: "700" },
  agentRole: { fontSize: 12, color: "#6b7280" },
  currentTask: { fontSize: 12, color: "#2563eb", marginTop: 2 },
  pendingTag: { fontSize: 11, color: "#d97706", fontWeight: "600", marginTop: 2 },
  cardRight: { alignItems: "flex-end", gap: 6 },
  statusBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: "600" },
  levelText: { fontSize: 11, color: "#9ca3af", textTransform: "capitalize" },
});
