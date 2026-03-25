import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useQuery, useMutation } from "urql";
import { useRouter, useNavigation } from "expo-router";
import { useState, useMemo, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { AGENTS_QUERY, SET_AGENT_ACTIVATION } from "@agentcenter/graphql-client";
import {
  DEFAULT_AGENT_EMOJI,
  getAgentStatusColor,
  getAgentStatusLabel,
  isAgentOnline,
  filterAgentsBySetup,
  type AgentSetupFilter,
} from "@agentcenter/utils";
import type { Agent } from "@agentcenter/types";
import { useTheme } from "../../src/hooks/useTheme";
import { SearchBar } from "../../src/components/SearchBar";

type FilterTab = AgentSetupFilter;

const FILTER_LABELS: Record<FilterTab, string> = {
  all: "All",
  active: "Active",
  pending: "Pending",
  deactivated: "Deactivated",
};

export default function AgentsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  const [result, reexecute] = useQuery<{ agents: Agent[] }>({
    query: AGENTS_QUERY,
    requestPolicy: "cache-and-network",
  });

  const [, setActivation] = useMutation(SET_AGENT_ACTIVATION);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => router.push("/agent/create")}
          style={{ marginRight: 8, padding: 4 }}
        >
          <Ionicons name="add" size={26} color={colors.accent} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.accent]);

  const { data, fetching, error } = result;
  const allAgents = data?.agents ?? [];

  const filtered = useMemo(() => filterAgentsBySetup(allAgents, filter, search), [allAgents, filter, search]);

  const counts = useMemo(() => ({
    all: allAgents.length,
    active: allAgents.filter((a) => a.setupStatus === "active").length,
    pending: allAgents.filter((a) => a.setupStatus === "pending_setup").length,
    deactivated: allAgents.filter((a) => a.setupStatus === "deactivated").length,
  }), [allAgents]);

  if (fetching && allAgents.length === 0) {
    return <View className="flex-1 justify-center items-center"><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  if (error && allAgents.length === 0) {
    return (
      <View className="flex-1 justify-center items-center gap-3">
        <Text className="text-red-600 dark:text-red-400 text-base">Failed to load agents</Text>
        <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })} className="mt-1">
          <Text className="text-blue-600 dark:text-blue-400 text-sm font-semibold">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-slate-900">
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search agents…"
      />

      {/* Filter tabs */}
      <View className="flex-row bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-3">
        {(["all", "active", "pending", "deactivated"] as FilterTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            className={`flex-row items-center gap-1.5 py-2.5 px-2 border-b-2 ${filter === tab ? "border-blue-600" : "border-transparent"}`}
            onPress={() => setFilter(tab)}
            activeOpacity={0.7}
          >
            <Text className={`text-sm ${filter === tab ? "text-blue-600 font-semibold" : "text-gray-500 dark:text-slate-400 font-medium"}`}>
              {FILTER_LABELS[tab]}
            </Text>
            {counts[tab] > 0 && (
              <View className={`rounded-xl px-1.5 py-px min-w-5 items-center ${filter === tab ? "bg-blue-100 dark:bg-blue-900/30" : "bg-gray-100 dark:bg-slate-700"}`}>
                <Text className={`text-xs font-semibold ${filter === tab ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-slate-400"}`}>
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
        contentContainerStyle={filtered.length === 0
          ? { flex: 1, justifyContent: "center", alignItems: "center" }
          : { padding: 16, gap: 10 }
        }
        refreshControl={
          <RefreshControl refreshing={fetching} onRefresh={() => reexecute({ requestPolicy: "network-only" })} tintColor="#2563eb" />
        }
        ListEmptyComponent={
          <Text className="text-gray-400 dark:text-slate-500 text-base text-center">
            {search ? "No agents match your search" : "No agents in this category"}
          </Text>
        }
        renderItem={({ item }) => {
          const online = isAgentOnline(item.lastHeartbeat);
          const statusColor = getAgentStatusColor(item);
          const isPending = item.setupStatus === "pending_setup";
          const isDeactivated = item.setupStatus === "deactivated";

          return (
            <TouchableOpacity
              className={`bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 flex-row justify-between items-center gap-3 ${isDeactivated ? "opacity-60" : ""}`}
              onPress={() => router.push(`/agent/${item.id}`)}
              activeOpacity={0.7}
            >
              <View className="flex-row items-center gap-3 flex-1">
                <View className="w-11 h-11 rounded-full bg-gray-100 dark:bg-slate-700 justify-center items-center">
                  <Text className="text-xl">{item.identityEmoji ?? DEFAULT_AGENT_EMOJI}</Text>
                  <View
                    className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800"
                    style={{ backgroundColor: online ? statusColor : "#d1d5db" }}
                  />
                </View>
                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-base font-semibold text-gray-900 dark:text-slate-100">{item.name}</Text>
                    {item.upgradeAvailable && (
                      <View className="bg-amber-100 dark:bg-amber-900/30 rounded px-1 py-px">
                        <Text className="text-xs text-amber-600 dark:text-amber-400 font-bold">↑</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-xs text-gray-500 dark:text-slate-400">{item.role}</Text>
                  {item.currentTask && !isDeactivated && (
                    <Text className="text-xs text-blue-600 dark:text-blue-400 mt-0.5" numberOfLines={1}>{item.currentTask}</Text>
                  )}
                  {isPending && (
                    <Text className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-0.5">Needs setup</Text>
                  )}
                </View>
              </View>

              <View className="items-end gap-1.5">
                {isDeactivated ? (
                  <View className="bg-gray-100 dark:bg-slate-700 rounded px-1.5 py-0.5">
                    <Text className="text-xs font-semibold text-gray-400 dark:text-slate-500">Deactivated</Text>
                  </View>
                ) : (
                  <View
                    className="rounded px-1.5 py-0.5"
                    style={{ backgroundColor: (online ? statusColor : "#6b7280") + "22" }}
                  >
                    <Text className="text-xs font-semibold" style={{ color: online ? statusColor : "#6b7280" }}>
                      {online ? getAgentStatusLabel(item) : "Offline"}
                    </Text>
                  </View>
                )}
                <Text className="text-xs text-gray-400 dark:text-slate-500 capitalize">{item.level}</Text>
                {!isPending && (
                  <TouchableOpacity
                    className={`rounded-md px-2 py-0.5 ${isDeactivated ? "bg-blue-100 dark:bg-blue-900/30" : "bg-red-100 dark:bg-red-900/30"}`}
                    activeOpacity={0.7}
                    onPress={(e) => {
                      e.stopPropagation();
                      Alert.alert(
                        isDeactivated ? "Activate Agent" : "Deactivate Agent",
                        isDeactivated
                          ? `Activate ${item.name}?`
                          : `Deactivate ${item.name}? They will stop working on tasks.`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: isDeactivated ? "Activate" : "Deactivate",
                            style: isDeactivated ? "default" : "destructive",
                            onPress: async () => {
                              const res = await setActivation({ id: item.id, deactivated: !isDeactivated });
                              if (res.error) Alert.alert("Error", res.error.message ?? "Failed");
                              else reexecute({ requestPolicy: "network-only" });
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <Text className={`text-xs font-semibold ${isDeactivated ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}`}>
                      {isDeactivated ? "Activate" : "Deactivate"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}
