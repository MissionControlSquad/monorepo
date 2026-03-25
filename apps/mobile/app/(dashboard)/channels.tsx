import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
} from "react-native";
import { useQuery, useMutation } from "urql";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CHANNELS_QUERY, PROFILES_QUERY, START_CONVERSATION } from "@agentcenter/graphql-client";
import { PAGE_SIZE_CHANNELS, DEFAULT_AGENT_EMOJI } from "@agentcenter/utils";
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

export default function ChannelsScreen() {
  const router = useRouter();
  const { profileId } = useAuth();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE_CHANNELS);
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [dmSearch, setDmSearch] = useState("");

  const [result, reexecute] = useQuery<{ channels: Channel[] }>({
    query: CHANNELS_QUERY,
    variables: { profileId: profileId ?? undefined, limit },
    requestPolicy: "cache-and-network",
    pause: !profileId,
  });

  const [profilesResult] = useQuery<{ profiles: { id: string; displayName: string; username: string; avatarUrl: string | null; kind: string }[] }>({
    query: PROFILES_QUERY,
    variables: { limit: 200 },
    pause: !dmPickerOpen,
  });

  const [{ fetching: startingDm }, executeStartConversation] = useMutation(START_CONVERSATION);

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
      <View className="flex-1 justify-center items-center gap-3">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && allChannels.length === 0) {
    return (
      <View className="flex-1 justify-center items-center gap-3">
        <Text className="text-red-600 dark:text-red-400 text-base">Failed to load channels</Text>
        <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })}>
          <Text className="text-blue-600 dark:text-blue-400 text-sm font-semibold">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const dmProfiles = (profilesResult.data?.profiles ?? []).filter((p) => p.id !== profileId);
  const filteredDmProfiles = dmSearch.trim()
    ? dmProfiles.filter((p) => p.displayName.toLowerCase().includes(dmSearch.toLowerCase()) || p.username.toLowerCase().includes(dmSearch.toLowerCase()))
    : dmProfiles;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-slate-900">
      {/* Search bar */}
      <View className="flex-row items-center bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 px-3 py-2 gap-2">
        <Text className="text-sm">🔍</Text>
        <TextInput
          className="flex-1 text-base text-gray-900 dark:text-slate-100 py-1.5 px-1"
          placeholder="Search channels…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        <TouchableOpacity
          onPress={() => { setDmSearch(""); setDmPickerOpen(true); }}
          className="bg-blue-50 dark:bg-blue-900/20 rounded-lg px-2.5 py-1.5 border border-blue-200 dark:border-blue-800"
          activeOpacity={0.7}
        >
          <Text className="text-xs text-blue-600 dark:text-blue-400 font-semibold">💬 DM</Text>
        </TouchableOpacity>
      </View>

      {/* DM picker modal */}
      <Modal
        visible={dmPickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDmPickerOpen(false)}
      >
        <View className="flex-1 bg-white dark:bg-slate-900">
          <View className="flex-row justify-between items-center p-4 border-b border-gray-100 dark:border-slate-700">
            <Text className="text-lg font-bold text-gray-900 dark:text-slate-100">Start Direct Message</Text>
            <TouchableOpacity onPress={() => setDmPickerOpen(false)} className="p-1">
              <Text className="text-base text-gray-500 dark:text-slate-400">✕</Text>
            </TouchableOpacity>
          </View>
          <View className="px-4 py-2.5 border-b border-gray-100 dark:border-slate-700">
            <TextInput
              className="bg-gray-100 dark:bg-slate-700 rounded-xl px-3.5 py-2.5 text-base text-gray-900 dark:text-slate-100"
              placeholder="Search people…"
              placeholderTextColor="#9ca3af"
              value={dmSearch}
              onChangeText={setDmSearch}
              autoFocus
              autoCapitalize="none"
            />
          </View>
          {profilesResult.fetching ? (
            <ActivityIndicator className="mt-8" color="#2563eb" />
          ) : (
            <FlatList
              data={filteredDmProfiles}
              keyExtractor={(p) => p.id}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              ListEmptyComponent={<Text className="text-gray-400 dark:text-slate-500 text-base text-center p-4">No people found</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  className="flex-row items-center p-3.5 border-b border-gray-50 dark:border-slate-800 gap-3"
                  activeOpacity={0.7}
                  onPress={async () => {
                    if (!profileId) return;
                    const res = await executeStartConversation({ myProfileId: profileId, otherProfileId: item.id });
                    if (res.error) {
                      Alert.alert("Error", "Failed to start conversation");
                      return;
                    }
                    const channel = res.data?.startConversation;
                    setDmPickerOpen(false);
                    reexecute({ requestPolicy: "network-only" });
                    if (channel?.id) router.push(`/channels/${channel.id}`);
                  }}
                >
                  <View className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 justify-center items-center">
                    <Text className="text-lg">{item.kind === "agent" ? DEFAULT_AGENT_EMOJI : item.displayName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-gray-900 dark:text-slate-100">{item.displayName}</Text>
                    <Text className="text-xs text-gray-400 dark:text-slate-500">@{item.username}</Text>
                  </View>
                  {startingDm && <ActivityIndicator size="small" color="#2563eb" />}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      <FlatList
        data={channels}
        keyExtractor={(item) => item.id}
        contentContainerStyle={channels.length === 0
          ? { flex: 1, justifyContent: "center", alignItems: "center" }
          : { padding: 16, gap: 8 }
        }
        refreshControl={
          <RefreshControl
            refreshing={fetching && allChannels.length > 0}
            onRefresh={() => {
              setLimit(PAGE_SIZE_CHANNELS);
              reexecute({ requestPolicy: "network-only" });
            }}
            tintColor="#2563eb"
          />
        }
        onEndReached={() => {
          if (hasMore && !fetching && !search.trim()) setLimit((l) => l + PAGE_SIZE_CHANNELS);
        }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          fetching && allChannels.length > 0 ? (
            <ActivityIndicator color="#2563eb" style={{ marginVertical: 16 }} />
          ) : null
        }
        ListEmptyComponent={
          <Text className="text-gray-400 dark:text-slate-500 text-base">
            {search ? "No matching channels" : "No channels"}
          </Text>
        }
        renderItem={({ item }) => {
          const displayName = channelDisplayName(item, profileId);
          const icon = channelIcon(item);
          return (
            <TouchableOpacity
              className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 flex-row items-center gap-3"
              onPress={() => router.push(`/channels/${item.id}`)}
              activeOpacity={0.7}
            >
              <View className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 justify-center items-center">
                <Text className="text-lg">{icon}</Text>
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="text-base font-semibold text-gray-900 dark:text-slate-100">{displayName}</Text>
                {item.description ? (
                  <Text className="text-xs text-gray-500 dark:text-slate-400" numberOfLines={1}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
              {item.unreadCount > 0 && (
                <View className="bg-blue-600 rounded-xl min-w-5 h-5 justify-center items-center px-1.5">
                  <Text className="text-white text-xs font-bold">
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
