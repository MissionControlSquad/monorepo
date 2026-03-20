import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useQuery } from "urql";
import { useRouter } from "expo-router";
import { AGENTS_QUERY } from "@agentcenter/graphql-client";

interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  detailedStatus: string | null;
  statusMessage: string | null;
  currentTask: string | null;
  identityEmoji: string | null;
  level: string;
  username: string;
  lastHeartbeat: string | null;
  isOnVacation: boolean;
  profile: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl: string | null;
  } | null;
}

const STATUS_COLOR: Record<string, string> = {
  active: "#16a34a",
  idle: "#6b7280",
  blocked: "#dc2626",
};

const DETAILED_STATUS_COLOR: Record<string, string> = {
  thinking: "#7c3aed",
  coding: "#2563eb",
  reviewing: "#4f46e5",
  researching: "#d97706",
  deploying: "#ea580c",
  testing: "#0891b2",
  writing: "#059669",
  waiting_review: "#d97706",
  waiting_input: "#d97706",
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
  if (agent.detailedStatus) {
    return agent.detailedStatus.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return agent.status.charAt(0).toUpperCase() + agent.status.slice(1);
}

function isOnline(agent: Agent): boolean {
  if (!agent.lastHeartbeat) return false;
  const cutoff = Date.now() - 2 * 60 * 1000; // 2 minutes
  return new Date(agent.lastHeartbeat).getTime() > cutoff;
}

export default function AgentsScreen() {
  const router = useRouter();
  const [result, reexecute] = useQuery<{ agents: Agent[] }>({
    query: AGENTS_QUERY,
    requestPolicy: "cache-and-network",
  });

  const { data, fetching, error } = result;
  const agents = data?.agents ?? [];

  if (fetching && agents.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && agents.length === 0) {
    const msg = error.networkError?.message ?? error.graphQLErrors?.[0]?.message ?? error.message;
    console.error("[AgentsScreen] urql error:", error);
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load agents</Text>
        <Text style={[styles.errorText, { fontSize: 12, marginTop: 4 }]} numberOfLines={4}>{msg}</Text>
        <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={agents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={agents.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={fetching}
            onRefresh={() => reexecute({ requestPolicy: "network-only" })}
            tintColor="#2563eb"
          />
        }
        ListEmptyComponent={<Text style={styles.emptyText}>No agents</Text>}
        renderItem={({ item }) => {
          const online = isOnline(item);
          const statusColor = getStatusColor(item);
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/agent/${item.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.cardLeft}>
                <View style={styles.emojiContainer}>
                  <Text style={styles.emoji}>{item.identityEmoji ?? "🤖"}</Text>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: online ? statusColor : "#d1d5db" },
                    ]}
                  />
                </View>
                <View style={styles.info}>
                  <Text style={styles.agentName}>{item.name}</Text>
                  <Text style={styles.agentRole}>{item.role}</Text>
                  {item.currentTask && (
                    <Text style={styles.currentTask} numberOfLines={1}>
                      {item.currentTask}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.cardRight}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: (online ? statusColor : "#6b7280") + "22" },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: online ? statusColor : "#6b7280" },
                    ]}
                  >
                    {online ? getStatusLabel(item) : "Offline"}
                  </Text>
                </View>
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
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    gap: 12,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "#9ca3af",
    fontSize: 16,
  },
  errorText: {
    color: "#dc2626",
    fontSize: 16,
  },
  retryText: {
    color: "#2563eb",
    fontSize: 14,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  emojiContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  emoji: {
    fontSize: 22,
  },
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
  info: {
    flex: 1,
    gap: 2,
  },
  agentName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  agentRole: {
    fontSize: 12,
    color: "#6b7280",
  },
  currentTask: {
    fontSize: 12,
    color: "#2563eb",
    marginTop: 2,
  },
  cardRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  levelText: {
    fontSize: 11,
    color: "#9ca3af",
    textTransform: "capitalize",
  },
});
