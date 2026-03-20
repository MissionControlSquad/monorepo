import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useQuery } from "urql";
import { PROJECTS_QUERY } from "@agentcenter/graphql-client";

interface ProjectMember {
  id: string;
  profileId: string;
  role: string;
  profile: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl: string | null;
    kind: string;
  };
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  members: ProjectMember[];
}

function memberEmojis(members: ProjectMember[]): string {
  const agents = members.filter((m) => m.profile.kind === "agent");
  const humans = members.filter((m) => m.profile.kind === "human");
  const parts: string[] = [];
  if (agents.length > 0) parts.push(`🤖 ${agents.length}`);
  if (humans.length > 0) parts.push(`👤 ${humans.length}`);
  return parts.join("  ") || `${members.length} members`;
}

export default function ProjectsScreen() {
  const [result, reexecute] = useQuery<{ projects: Project[] }>({
    query: PROJECTS_QUERY,
    requestPolicy: "cache-and-network",
  });

  const { data, fetching, error } = result;
  const projects = data?.projects ?? [];

  if (fetching && projects.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && projects.length === 0) {
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
      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={projects.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={fetching}
            onRefresh={() => reexecute({ requestPolicy: "network-only" })}
            tintColor="#2563eb"
          />
        }
        ListHeaderComponent={
          <Text style={styles.countText}>
            {projects.length} {projects.length === 1 ? "project" : "projects"}
          </Text>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>No projects yet</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.7}>
            <View style={styles.cardHeader}>
              <View style={styles.iconContainer}>
                <Text style={styles.iconText}>📁</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.projectName}>{item.name}</Text>
                {item.description ? (
                  <Text style={styles.description} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
            </View>
            {item.members.length > 0 && (
              <Text style={styles.members}>{memberEmojis(item.members)}</Text>
            )}
          </TouchableOpacity>
        )}
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
  countText: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 8,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
  },
  iconText: {
    fontSize: 20,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  projectName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  description: {
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 18,
  },
  members: {
    fontSize: 12,
    color: "#9ca3af",
  },
});
