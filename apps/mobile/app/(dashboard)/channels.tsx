import {
  View,
  Text,
  SectionList,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
} from "react-native";
import { useQuery, useMutation } from "urql";
import { useRouter, useNavigation } from "expo-router";
import { useState, useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CHANNELS_QUERY, PROFILES_QUERY, START_CONVERSATION, CREATE_CHANNEL } from "@agentcenter/graphql-client";
import { PAGE_SIZE_CHANNELS, DEFAULT_AGENT_EMOJI, ProfileKind, ChannelVisibility } from "@agentcenter/utils";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { SearchBar } from "../../src/components/SearchBar";
import { ScreenLoading } from "../../src/components/ScreenLoading";
import { ScreenError } from "../../src/components/ScreenError";

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
  if (channel.visibility === ChannelVisibility.DM && myProfileId) {
    const other = channel.members.find((m) => m.profileId !== myProfileId);
    if (other) return other.profile.displayName;
  }
  return channel.name;
}

function toSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function channelIcon(channel: Channel): string {
  if (channel.visibility === ChannelVisibility.DM) return "💬";
  if (channel.visibility === ChannelVisibility.PRIVATE) return "🔒";
  return "#";
}

export default function ChannelsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { profileId } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE_CHANNELS);
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [dmSearch, setDmSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createVisibility, setCreateVisibility] = useState<"public" | "private">(ChannelVisibility.PUBLIC);
  const [createDescription, setCreateDescription] = useState("");
  const [creating, setCreating] = useState(false);

  // Header + button → opens create channel modal (channel-only, no DM)
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => {
            setCreateName(""); setCreateSlug(""); setCreateVisibility(ChannelVisibility.PUBLIC); setCreateDescription(""); setCreateOpen(true);
          }}
          style={{ padding: 8 }}
        >
          <Ionicons name="add" size={26} color={colors.accent} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.accent]);

  // Mutations before queries — avoids useSyncExternalStore update-during-render with URQL v5
  const [{ fetching: startingDm }, executeStartConversation] = useMutation(START_CONVERSATION);
  const [, executeCreateChannel] = useMutation(CREATE_CHANNEL);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [result, reexecute] = useQuery<{ channels: Channel[] }>({
    query: CHANNELS_QUERY,
    variables: { profileId: profileId ?? undefined, limit },
    requestPolicy: "cache-and-network",
    pause: !mounted || !profileId,
  });

  const [dmsResult, reexecuteDms] = useQuery<{ channels: Channel[] }>({
    query: CHANNELS_QUERY,
    variables: { profileId: profileId ?? undefined, visibility: ChannelVisibility.DM, limit: 100 },
    requestPolicy: "cache-and-network",
    pause: !mounted || !profileId,
  });

  const [profilesResult] = useQuery<{ profiles: { id: string; displayName: string; username: string; avatarUrl: string | null; kind: string }[] }>({
    query: PROFILES_QUERY,
    variables: { limit: 200 },
    pause: !mounted || !dmPickerOpen,
  });

  async function handleCreateChannel() {
    if (!profileId || !createName.trim() || !createSlug.trim()) return;
    setCreating(true);
    const res = await executeCreateChannel({
      name: createName.trim(),
      slug: createSlug.trim(),
      visibility: createVisibility,
      description: createDescription.trim() || undefined,
      createdByProfileId: profileId,
    });
    setCreating(false);
    if (res.error) {
      Alert.alert("Error", res.error.graphQLErrors?.[0]?.message ?? res.error.message ?? "Failed to create channel");
      return;
    }
    const channel = res.data?.createChannel;
    setCreateOpen(false);
    setCreateName(""); setCreateSlug(""); setCreateVisibility(ChannelVisibility.PUBLIC); setCreateDescription("");
    reexecute({ requestPolicy: "network-only" });
    if (channel?.id) router.push(`/channels/${channel.id}` as Parameters<typeof router.push>[0]);
  }

  const { data, fetching, error } = result;
  const allChannels = data?.channels ?? [];
  const allDms = dmsResult.data?.channels ?? [];
  const hasMore = allChannels.length === limit;
  const q = search.trim().toLowerCase();
  const channels = q
    ? allChannels.filter((c) =>
        channelDisplayName(c, profileId).toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q)
      )
    : allChannels;
  const dms = q
    ? allDms.filter((c) => channelDisplayName(c, profileId).toLowerCase().includes(q))
    : allDms;

  if (fetching && allChannels.length === 0) return <ScreenLoading />;
  if (error && allChannels.length === 0) return <ScreenError message="Failed to load channels" onRetry={() => reexecute({ requestPolicy: "network-only" })} />;

  const dmProfiles = (profilesResult.data?.profiles ?? []).filter((p) => p.id !== profileId);
  const filteredDmProfiles = dmSearch.trim()
    ? dmProfiles.filter((p) => p.displayName.toLowerCase().includes(dmSearch.toLowerCase()) || p.username.toLowerCase().includes(dmSearch.toLowerCase()))
    : dmProfiles;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-slate-900">
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search channels…"
      />

      {/* Create channel modal */}
      <Modal
        visible={createOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCreateOpen(false)}
      >
        <View className="flex-1 bg-white dark:bg-slate-900">
          <View className="flex-row justify-between items-center p-4 border-b border-gray-100 dark:border-slate-700">
            <Text className="text-lg font-bold text-gray-900 dark:text-slate-100">New Channel</Text>
            <TouchableOpacity onPress={() => setCreateOpen(false)} className="p-1">
              <Text className="text-base text-gray-500 dark:text-slate-400">✕</Text>
            </TouchableOpacity>
          </View>
          <View className="p-4 gap-4">
            {/* Name */}
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Channel Name *</Text>
              <TextInput
                className="bg-gray-100 dark:bg-slate-700 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
                placeholder="e.g. General"
                placeholderTextColor="#9ca3af"
                value={createName}
                onChangeText={(v) => { setCreateName(v); setCreateSlug(toSlug(v)); }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {/* Slug */}
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Slug *</Text>
              <TextInput
                className="bg-gray-100 dark:bg-slate-700 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100 font-mono"
                placeholder="e.g. general"
                placeholderTextColor="#9ca3af"
                value={createSlug}
                onChangeText={setCreateSlug}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {/* Visibility toggle */}
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Visibility</Text>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setCreateVisibility(ChannelVisibility.PUBLIC)}
                  className={`flex-1 py-2.5 rounded-xl border items-center ${createVisibility === ChannelVisibility.PUBLIC ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700" : "bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700"}`}
                  activeOpacity={0.7}
                >
                  <Text className={`text-sm font-semibold ${createVisibility === ChannelVisibility.PUBLIC ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-slate-400"}`}># Public</Text>
                  <Text className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Anyone can join</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setCreateVisibility(ChannelVisibility.PRIVATE)}
                  className={`flex-1 py-2.5 rounded-xl border items-center ${createVisibility === ChannelVisibility.PRIVATE ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700" : "bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700"}`}
                  activeOpacity={0.7}
                >
                  <Text className={`text-sm font-semibold ${createVisibility === ChannelVisibility.PRIVATE ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-slate-400"}`}>🔒 Private</Text>
                  <Text className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Invite only</Text>
                </TouchableOpacity>
              </View>
            </View>
            {/* Description */}
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Description (optional)</Text>
              <TextInput
                className="bg-gray-100 dark:bg-slate-700 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
                placeholder="What's this channel for?"
                placeholderTextColor="#9ca3af"
                value={createDescription}
                onChangeText={setCreateDescription}
                multiline
                numberOfLines={2}
              />
            </View>
            {/* Create button */}
            <TouchableOpacity
              onPress={handleCreateChannel}
              disabled={!createName.trim() || !createSlug.trim() || creating}
              className={`py-3 rounded-xl items-center mt-2 ${(!createName.trim() || !createSlug.trim() || creating) ? "bg-blue-300 dark:bg-blue-800" : "bg-blue-600"}`}
              activeOpacity={0.8}
            >
              <Text className="text-white font-bold text-base">{creating ? "Creating…" : "Create Channel"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
                      Alert.alert("Error", res.error.graphQLErrors?.[0]?.message ?? res.error.message ?? "Failed to start conversation");
                      return;
                    }
                    const channel = res.data?.startConversation;
                    setDmPickerOpen(false);
                    reexecute({ requestPolicy: "network-only" });
                    reexecuteDms({ requestPolicy: "network-only" });
                    if (channel?.id) router.push(`/channels/${channel.id}` as Parameters<typeof router.push>[0]);
                  }}
                >
                  <View className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 justify-center items-center">
                    <Text className="text-lg">{item.kind === ProfileKind.AGENT ? DEFAULT_AGENT_EMOJI : item.displayName.charAt(0).toUpperCase()}</Text>
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

      <SectionList
        sections={[
          ...(dms.length > 0 ? [{ title: "Direct Messages", data: dms, isDm: true }] : []),
          ...(channels.length > 0 ? [{ title: "Channels", data: channels, isDm: false }] : []),
        ]}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          dms.length === 0 && channels.length === 0
            ? { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 }
            : { padding: 12, paddingBottom: insets.bottom + 24 }
        }
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={(fetching || dmsResult.fetching) && (allChannels.length > 0 || allDms.length > 0)}
            onRefresh={() => {
              setLimit(PAGE_SIZE_CHANNELS);
              reexecute({ requestPolicy: "network-only" });
              reexecuteDms({ requestPolicy: "network-only" });
            }}
            tintColor="#2563eb"
          />
        }
        onEndReached={() => {
          if (hasMore && !fetching && !search.trim()) setLimit((l) => l + PAGE_SIZE_CHANNELS);
        }}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <Text className="text-gray-400 dark:text-slate-500 text-base text-center">
            {search.trim() ? "No matching channels or DMs" : "No channels yet"}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <View className="flex-row items-center justify-between px-1 pt-3 pb-1.5">
            <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">
              {section.title}
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (section.isDm) {
                  setDmSearch(""); setDmPickerOpen(true);
                } else {
                  setCreateName(""); setCreateSlug(""); setCreateVisibility(ChannelVisibility.PUBLIC); setCreateDescription(""); setCreateOpen(true);
                }
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text className="text-xs text-blue-600 dark:text-blue-400 font-semibold">+ New</Text>
            </TouchableOpacity>
          </View>
        )}
        renderItem={({ item }) => {
          const displayName = channelDisplayName(item, profileId);
          const icon = channelIcon(item);
          const isDm = item.visibility === ChannelVisibility.DM;
          return (
            <TouchableOpacity
              className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 flex-row items-center gap-3 mb-2"
              onPress={() => router.push(`/channels/${item.id}`)}
              activeOpacity={0.7}
            >
              <View className={`w-10 h-10 rounded-full justify-center items-center ${isDm ? "bg-purple-50 dark:bg-purple-900/20" : "bg-blue-50 dark:bg-blue-900/20"}`}>
                <Text className="text-lg">{icon}</Text>
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="text-base font-semibold text-gray-900 dark:text-slate-100">{displayName}</Text>
                {!isDm && item.description ? (
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
