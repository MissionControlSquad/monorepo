import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && allProjects.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load projects</Text>
        <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search projects…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        <TouchableOpacity
          onPress={() => router.push("/project/create")}
          style={styles.createBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.createBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Status filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        bounces={false}
        directionalLockEnabled={true}
        style={styles.filterBar}
        contentContainerStyle={styles.filterContent}
      >
        {filters.map((f) => {
          const count =
            f.key === "all"
              ? allProjects.length
              : allProjects.filter((p) => p.status === f.key).length;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
              onPress={() => setStatusFilter(f.key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  statusFilter === f.key && styles.filterChipTextActive,
                ]}
              >
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
          projects.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={fetching}
            onRefresh={() => reexecute({ requestPolicy: "network-only" })}
            tintColor="#2563eb"
          />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {search ? "No matching projects" : "No projects"}
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push(`/project/${item.id}`)}
          >
            <View style={styles.cardHeader}>
              <View style={styles.iconContainer}>
                <Text style={styles.iconText}>📁</Text>
              </View>
              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={styles.projectName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: STATUS_HEX_COLORS[item.status ?? ""] ?? DEFAULT_COLOR },
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>{item.status}</Text>
                  </View>
                </View>
                {item.description ? (
                  <Text style={styles.description} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
            </View>
            {(item.members ?? []).length > 0 && (
              <Text style={styles.members}>{memberEmojis(item.members ?? [])}</Text>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    gap: 12,
  },
  filterBar: {
    height: 52,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  filterContent: { paddingHorizontal: 12, gap: 8, flexDirection: "row", alignItems: "center", height: 52 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
  },
  filterChipActive: { backgroundColor: "#dbeafe" },
  filterChipText: { fontSize: 13, color: "#6b7280", fontWeight: "500" },
  filterChipTextActive: { color: "#2563eb", fontWeight: "600" },
  listContent: { padding: 16, gap: 10 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { color: "#9ca3af", fontSize: 16 },
  errorText: { color: "#dc2626", fontSize: 16 },
  retryText: { color: "#2563eb", fontSize: 14, fontWeight: "600" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 10,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
  },
  iconText: { fontSize: 20 },
  info: { flex: 1, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  projectName: { fontSize: 15, fontWeight: "600", color: "#111827", flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  statusBadgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  description: { fontSize: 13, color: "#6b7280", lineHeight: 18 },
  members: { fontSize: 12, color: "#9ca3af" },
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
  searchIcon: { fontSize: 14 },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  createBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
  },
  createBtnText: { fontSize: 20, color: "#fff", lineHeight: 24, fontWeight: "400" },
});
