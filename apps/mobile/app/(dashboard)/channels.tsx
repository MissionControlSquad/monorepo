import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from "react-native";
import { useQuery } from "urql";
import { useRouter } from "expo-router";
import { useState } from "react";
import { CHANNELS_QUERY } from "@agentcenter/graphql-client";
import { useAuth } from "../../src/context/AuthContext";

interface ChannelMember {
  id: string;
  profileId: string;
  role: string;
  profile: { id: string; kind: string; displayName: string; username: string; avatarUrl: string | null };
}

interface Channel {
  id: string;
  name: string;
  slug: string;
  visibility: string;
  description: string | null;
  unreadCount: number;
  members: ChannelMember[];
}

function channelDisplayName(channel: Channel, myProfileId: string | null): string {
  if (channel.visibility === "dm" && myProfileId) {
    const other = channel.members.find((m) => m.profileId !== myProfileId);
    if (other) return other.profile.displayName;
  }
  return channel.name;
}

function channelIcon(channel: Channel): string {
  if (channel.visibility === "dm") return "💬";
  if (channel.visibility === "private") return "🔒";
  return "#";
}

const PAGE_SIZE = 50;

export default function ChannelsScreen() {
  const router = useRouter();
  const { profileId } = useAuth();
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const [result, reexecute] = useQuery<{ channels: Channel[] }>({
    query: CHANNELS_QUERY,
    variables: { profileId: profileId ?? undefined, limit },
    requestPolicy: "cache-and-network",
    pause: !profileId,
  });

  const { data, fetching, error } = result;
  const allChannels = data?.channels ?? [];
  const hasMore = allChannels.length === limit;
  const channels = search.trim()
    ? allChannels.filter((c) =>
        channelDisplayName(c, profileId).toLowerCase().includes(search.toLowerCase()) ||
        (c.description ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : allChannels;

  if (fetching && allChannels.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && allChannels.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load channels</Text>
        <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search channels…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      <FlatList
        data={channels}
        keyExtractor={(item) => item.id}
        contentContainerStyle={channels.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={fetching && allChannels.length > 0}
            onRefresh={() => {
              setLimit(PAGE_SIZE);
              reexecute({ requestPolicy: "network-only" });
            }}
            tintColor="#2563eb"
          />
        }
        onEndReached={() => {
          if (hasMore && !fetching && !search.trim()) setLimit((l) => l + PAGE_SIZE);
        }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          fetching && allChannels.length > 0 ? (
            <ActivityIndicator color="#2563eb" style={{ marginVertical: 16 }} />
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {search ? "No matching channels" : "No channels"}
          </Text>
        }
        renderItem={({ item }) => {
          const displayName = channelDisplayName(item, profileId);
          const icon = channelIcon(item);
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/channels/${item.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.iconContainer}>
                <Text style={styles.channelIcon}>{icon}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.channelName}>{displayName}</Text>
                {item.description ? (
                  <Text style={styles.description} numberOfLines={1}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
              {item.unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {item.unreadCount > 99 ? "99+" : item.unreadCount}
                  </Text>
                </View>
              )}
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
    gap: 8,
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
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
  },
  channelIcon: {
    fontSize: 18,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  channelName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  description: {
    fontSize: 12,
    color: "#6b7280",
  },
  badge: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
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
});
