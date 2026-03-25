import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TextInput,
} from "react-native";
import { useQuery } from "urql";
import { useRouter } from "expo-router";
import { useState } from "react";
import { PROJECTS_QUERY } from "@agentcenter/graphql-client";
import { STATUS_HEX_COLORS, DEFAULT_COLOR } from "@agentcenter/utils";
import type { Project, ProjectMember } from "@agentcenter/types";

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const [result, reexecute] = useQuery<{ projects: Project[] }>({
    query: PROJECTS_QUERY,
    requestPolicy: "cache-and-network",
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
    { key: "active", label: "Active" },
    { key: "archived", label: "Archived" },
  ];

  if (fetching && allProjects.length === 0) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900 gap-3">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && allProjects.length === 0) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900 gap-3">
        <Text className="text-red-600 dark:text-red-400 text-base">Failed to load projects</Text>
        <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })}>
          <Text className="text-blue-600 dark:text-blue-400 text-sm font-semibold">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-slate-900">
      {/* Search */}
      <View className="flex-row items-center bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 px-3 py-2 gap-2">
        <Text className="text-sm">🔍</Text>
        <TextInput
          className="flex-1 text-base text-gray-900 dark:text-slate-100 py-1.5 px-1"
          placeholder="Search projects…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        <TouchableOpacity
          onPress={() => router.push("/project/create")}
          className="w-8 h-8 rounded-full bg-blue-600 justify-center items-center"
          activeOpacity={0.7}
        >
          <Text className="text-xl text-white leading-6">+</Text>
        </TouchableOpacity>
      </View>

      {/* Status filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        bounces={false}
        directionalLockEnabled={true}
        className="h-14 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700"
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, flexDirection: "row", alignItems: "center", height: 52 }}
      >
        {filters.map((f) => {
          const count =
            f.key === "all"
              ? allProjects.length
              : allProjects.filter((p) => p.status === f.key).length;
          return (
            <TouchableOpacity
              key={f.key}
              className={`px-3.5 py-2 rounded-full ${statusFilter === f.key ? "bg-blue-100 dark:bg-blue-900/30" : "bg-gray-100 dark:bg-slate-700"}`}
              onPress={() => setStatusFilter(f.key)}
            >
              <Text className={`text-sm ${statusFilter === f.key ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-gray-500 dark:text-slate-400 font-medium"}`}>
                {f.label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

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
