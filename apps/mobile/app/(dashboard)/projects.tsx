import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useQuery } from "urql";
import { useRouter, useNavigation } from "expo-router";
import { useState, useEffect } from "react";
import { PROJECTS_QUERY } from "@agentcenter/graphql-client";
import { STATUS_HEX_COLORS, DEFAULT_COLOR, ProjectStatus } from "@agentcenter/utils";
import type { Project, ProjectMember } from "@agentcenter/types";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../src/hooks/useTheme";
import { SearchBar } from "../../src/components/SearchBar";
import { ScreenLoading } from "../../src/components/ScreenLoading";
import { ScreenError } from "../../src/components/ScreenError";
import { TabFilterStrip } from "../../src/components/TabFilterStrip";

type StatusFilter = "all" | "active" | "archived";

function memberEmojis(members: ProjectMember[]): string {
  const agents = members.filter((m) => m.profile?.agentId != null);
  const humans = members.filter((m) => m.profile?.agentId == null);
  const parts: string[] = [];
  if (agents.length > 0) parts.push(`🤖 ${agents.length}`);
  if (humans.length > 0) parts.push(`👤 ${humans.length}`);
  return parts.join("  ") || `${members.length} members`;
}

export default function ProjectsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => router.push("/project/create")}
          style={{ padding: 8 }}
        >
          <Ionicons name="add" size={26} color={colors.accent} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.accent]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [result, reexecute] = useQuery<{ projects: Project[] }>({
    query: PROJECTS_QUERY,
    requestPolicy: "cache-and-network",
    pause: !mounted,
  });

  const { data, fetching, error } = result;
  const allProjects = data?.projects ?? [];
  const byStatus =
    statusFilter === "all"
      ? allProjects
      : allProjects.filter((p) => p.status === statusFilter);
  const projects = search.trim()
    ? byStatus.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.description ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : byStatus;

  const filters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: ProjectStatus.ACTIVE, label: "Active" },
    { key: ProjectStatus.ARCHIVED, label: "Archived" },
  ];

  if (fetching && allProjects.length === 0) return <ScreenLoading />;
  if (error && allProjects.length === 0) return <ScreenError message="Failed to load projects" onRetry={() => reexecute({ requestPolicy: "network-only" })} />;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-slate-900">
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search projects…"
      />

      {/* Status filter */}
      <TabFilterStrip
        filters={filters}
        activeKey={statusFilter}
        onSelect={setStatusFilter}
        getCount={(key) => key === "all" ? allProjects.length : allProjects.filter((p) => p.status === key).length}
      />

      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          projects.length === 0
            ? { flex: 1, justifyContent: "center", alignItems: "center" }
            : { padding: 16, gap: 10 }
        }
        refreshControl={
          <RefreshControl
            refreshing={fetching}
            onRefresh={() => reexecute({ requestPolicy: "network-only" })}
            tintColor="#2563eb"
          />
        }
        ListEmptyComponent={
          <Text className="text-gray-400 dark:text-slate-500 text-base">
            {search ? "No matching projects" : "No projects"}
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 gap-2.5"
            activeOpacity={0.7}
            onPress={() => router.push(`/project/${item.id}`)}
          >
            <View className="flex-row items-start gap-3">
              <View className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 justify-center items-center">
                <Text className="text-xl">📁</Text>
              </View>
              <View className="flex-1 gap-1">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-base font-semibold text-gray-900 dark:text-slate-100 flex-1" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View
                    className="px-2 py-0.5 rounded-lg"
                    style={{ backgroundColor: STATUS_HEX_COLORS[item.status ?? ""] ?? DEFAULT_COLOR }}
                  >
                    <Text className="text-white text-xs font-semibold">{item.status}</Text>
                  </View>
                </View>
                {item.description ? (
                  <Text className="text-sm text-gray-500 dark:text-slate-400 leading-5" numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
            </View>
            {(item.members ?? []).length > 0 && (
              <Text className="text-xs text-gray-400 dark:text-slate-500">
                {memberEmojis(item.members ?? [])}
              </Text>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
