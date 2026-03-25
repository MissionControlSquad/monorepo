import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useQuery, useMutation, useSubscription } from "urql";
import { useState, useEffect, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CHANNEL_MESSAGES_QUERY, CHANNEL_QUERY, CHANNEL_PINNED_MESSAGES_QUERY, ON_NEW_CHANNEL_MESSAGE, PROFILES_QUERY, SEARCH_CHANNEL_MESSAGES_QUERY } from "@agentcenter/graphql-client";
import { CREATE_CHANNEL_MESSAGE, MARK_CHANNEL_READ, TOGGLE_CHANNEL_MESSAGE_REACTION, UPDATE_CHANNEL_MESSAGE, DELETE_CHANNEL_MESSAGE, PIN_CHANNEL_MESSAGE, UNPIN_CHANNEL_MESSAGE, ADD_CHANNEL_MEMBER, REMOVE_CHANNEL_MEMBER, JOIN_CHANNEL, LEAVE_CHANNEL, DELETE_CHANNEL } from "@agentcenter/graphql-client";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/hooks/useTheme";
import { formatChatTime, appendDeduped } from "@agentcenter/utils";
import { MentionInput } from "../../src/components/MentionInput";

interface FromProfile {
  id: string;
  kind: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
}

interface ProfileOption {
  id: string;
  kind: string;
  displayName: string;
  username: string | null;
}

interface Attachment {
  id: string;
  messageId: string;
  documentId: string;
  document: {
    id: string;
    title: string;
    type: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  };
}

interface Message {
  id: string;
  channelId: string;
  fromProfileId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  pinnedAt: string | null;
  pinnedByProfileId: string | null;
  fromProfile: FromProfile;
  reactions: { id: string; profileId: string; emoji: string; profile: { id: string; displayName: string } }[];
  attachments: Attachment[];
}

interface Channel {
  id: string;
  name: string;
  visibility: string;
  createdByProfileId: string;
  members: { id: string; profileId: string; profile: { id: string; kind: string; displayName: string; username?: string | null } }[];
}

export default function ChannelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { profileId } = useAuth();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [profileSearch, setProfileSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const listRef = useRef<FlatList>(null);

  const [channelResult, reexecuteChannel] = useQuery<{ channel: Channel | null }>({
    query: CHANNEL_QUERY,
    variables: { id },
    requestPolicy: "cache-and-network",
  });

  const [messagesResult, reexecute] = useQuery<{ channelMessages: Message[] }>({
    query: CHANNEL_MESSAGES_QUERY,
    variables: { channelId: id, limit: 100 },
    requestPolicy: "cache-and-network",
  });

  const [pinnedResult] = useQuery<{ channelPinnedMessages: Message[] }>({
    query: CHANNEL_PINNED_MESSAGES_QUERY,
    variables: { channelId: id, limit: 50 },
    requestPolicy: "cache-and-network",
  });

  const [searchResult] = useQuery<{ searchChannelMessages: Message[] }>({
    query: SEARCH_CHANNEL_MESSAGES_QUERY,
    variables: { channelId: id, query: searchQuery.trim(), limit: 50 },
    pause: !searchOpen || searchQuery.trim().length < 2,
    requestPolicy: "cache-and-network",
  });

  const [, executeSend] = useMutation(CREATE_CHANNEL_MESSAGE);
  const [, executeMarkRead] = useMutation(MARK_CHANNEL_READ);
  const [, executeToggleReaction] = useMutation(TOGGLE_CHANNEL_MESSAGE_REACTION);
  const [, executeUpdateMessage] = useMutation(UPDATE_CHANNEL_MESSAGE);
  const [, executeDeleteMessage] = useMutation(DELETE_CHANNEL_MESSAGE);
  const [, executePinMessage] = useMutation(PIN_CHANNEL_MESSAGE);
  const [, executeUnpinMessage] = useMutation(UNPIN_CHANNEL_MESSAGE);
  const [, executeAddMember] = useMutation(ADD_CHANNEL_MEMBER);
  const [, executeRemoveMember] = useMutation(REMOVE_CHANNEL_MEMBER);
  const [, executeJoin] = useMutation(JOIN_CHANNEL);
  const [, executeLeave] = useMutation(LEAVE_CHANNEL);
  const [, executeDeleteChannel] = useMutation(DELETE_CHANNEL);

  const [profilesResult] = useQuery<{ profiles: ProfileOption[] }>({
    query: PROFILES_QUERY,
    pause: !addMemberOpen,
    requestPolicy: "cache-and-network",
  });

  // Real-time subscription — accumulate new messages as they arrive
  const [subResult] = useSubscription(
    { query: ON_NEW_CHANNEL_MESSAGE, variables: { channelId: id } },
    (prev: Message[] = [], response: { newChannelMessage: Message }) => {
      const incoming = response.newChannelMessage;
      if (!incoming) return prev;
      const exists = prev.some((m) => m.id === incoming.id);
      return exists ? prev : [...prev, incoming];
    }
  );

  const channel = channelResult.data?.channel;
  const pinnedMessages = pinnedResult.data?.channelPinnedMessages ?? [];
  const memberIds = new Set((channel?.members ?? []).map((m) => m.profileId));
  const isMember = profileId ? memberIds.has(profileId) : false;
  const allProfiles = profilesResult.data?.profiles ?? [];
  const filteredProfiles = allProfiles.filter((p) => {
    if (memberIds.has(p.id)) return false;
    if (!profileSearch.trim()) return true;
    const q = profileSearch.toLowerCase();
    return p.displayName.toLowerCase().includes(q) || (p.username ?? "").toLowerCase().includes(q);
  });
  const baseMessages = messagesResult.data?.channelMessages ?? [];
  // Merge subscription messages with fetched messages, deduplicate by id
  const liveMessages = subResult.data ?? [];
  const messages = appendDeduped(baseMessages, liveMessages);
  const { fetching, error } = messagesResult;

  useEffect(() => {
    if (channel) {
      navigation.setOptions({
        title: channel.name,
        headerRight: () => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginRight: 8 }}>
            <TouchableOpacity
              onPress={() => {
                setSearchOpen((v) => {
                  if (v) setSearchQuery("");
                  return !v;
                });
              }}
              style={{ padding: 8 }}
            >
              <Ionicons name={searchOpen ? "close" : "search-outline"} size={20} color={colors.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMembersOpen(true)} style={{ padding: 8 }}>
              <Ionicons name="people-outline" size={22} color={colors.accent} />
            </TouchableOpacity>
          </View>
        ),
      });
    }
  }, [channel, navigation, isMember, searchOpen]);

  useEffect(() => {
    if (messages.length > 0 && profileId) {
      executeMarkRead({ channelId: id, profileId });
    }
  }, [messages.length, id, profileId]);

  const handleSend = async () => {
    const content = message.trim();
    if (!content || !profileId) return;
    setSending(true);
    setMessage("");
    try {
      const res = await executeSend({
        channelId: id,
        fromProfileId: profileId,
        content,
      });
      if (res.error) {
        Alert.alert("Error", "Failed to send message");
        setMessage(content);
      } else {
        reexecute({ requestPolicy: "network-only" });
      }
    } finally {
      setSending(false);
    }
  };

  if (fetching && messages.length === 0) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && messages.length === 0) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900">
        <Text className="text-red-600 text-base">Failed to load messages</Text>
      </View>
    );
  }

  const searchMessages = searchResult.data?.searchChannelMessages ?? [];
  const displayMessages = searchOpen && searchQuery.trim().length >= 2 ? searchMessages : messages;
  // Inverted FlatList renders index 0 at visual bottom — so newest message goes first
  const invertedMessages = [...displayMessages].reverse();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0}
    >
      {/* Search bar */}
      {searchOpen && (
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={{ flex: 1, fontSize: 15, color: colors.text, paddingVertical: 4 }}
            placeholder="Search messages…"
            placeholderTextColor={colors.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          {searchResult.fetching && <ActivityIndicator size="small" color={colors.accent} style={{ marginLeft: 4 }} />}
        </View>
      )}
      <FlatList
        ref={searchOpen ? undefined : listRef}
        data={invertedMessages}
        keyExtractor={(item) => item.id}
        inverted
        contentContainerStyle={{ paddingVertical: 12 }}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          pinnedMessages.length > 0 ? (
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: isDark ? "rgba(234,179,8,0.15)" : "#fefce8", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginHorizontal: 12, marginBottom: 8, borderWidth: 1, borderColor: isDark ? "rgba(234,179,8,0.3)" : "#fde68a" }}
              onPress={() => setPinnedOpen(true)}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 14 }}>📌</Text>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: isDark ? "#fbbf24" : "#92400e" }}>
                {pinnedMessages.length} pinned {pinnedMessages.length === 1 ? "message" : "messages"}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={isDark ? "#fbbf24" : "#92400e"} />
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 60 }}>
            <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: "center" }}>
              {searchOpen && searchQuery.trim().length >= 2
                ? "No messages match your search"
                : searchOpen
                ? "Type at least 2 characters to search"
                : "No messages yet. Say hello! 👋"}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const isMe = item.fromProfileId === profileId;

          // In inverted data: index+1 = older (visual above), index-1 = newer (visual below)
          const olderMsg = invertedMessages[index + 1];
          const newerMsg = invertedMessages[index - 1];
          const isTopOfGroup = !olderMsg || olderMsg.fromProfileId !== item.fromProfileId;
          const isBottomOfGroup = !newerMsg || newerMsg.fromProfileId !== item.fromProfileId;

          // Group reactions by emoji
          const reactionGroups: Record<string, { emoji: string; count: number; iMine: boolean }> = {};
          for (const r of item.reactions ?? []) {
            if (!reactionGroups[r.emoji]) reactionGroups[r.emoji] = { emoji: r.emoji, count: 0, iMine: false };
            reactionGroups[r.emoji].count++;
            if (r.profileId === profileId) reactionGroups[r.emoji].iMine = true;
          }
          const reactionList = Object.values(reactionGroups);

          function handleReact(emoji: string) {
            if (!profileId) return;
            executeToggleReaction({ messageId: item.id, profileId, emoji }).then(() =>
              reexecute({ requestPolicy: "network-only" })
            );
          }

          function showMessageActions() {
            const isPinned = !!item.pinnedAt;
            const actions: { text: string; onPress?: () => void; style?: "cancel" | "destructive" }[] = [
              {
                text: isPinned ? "📌 Unpin" : "📌 Pin",
                onPress: () => {
                  if (!profileId) return;
                  const fn = isPinned ? executeUnpinMessage : executePinMessage;
                  fn({ messageId: item.id, profileId }).then(() => reexecute({ requestPolicy: "network-only" }));
                },
              },
              {
                text: "😀 React",
                onPress: () => {
                  Alert.alert("React", undefined, [
                    ...["👍", "❤️", "😂", "🎉", "🔥", "👀"].map((e) => ({
                      text: e,
                      onPress: () => handleReact(e),
                    })),
                    { text: "Cancel", style: "cancel" as const },
                  ]);
                },
              },
            ];
            if (isMe) {
              actions.push({
                text: "✏️ Edit",
                onPress: () => {
                  Alert.prompt("Edit Message", undefined, (newContent) => {
                    if (!newContent?.trim() || !profileId) return;
                    executeUpdateMessage({ messageId: item.id, profileId, content: newContent.trim() }).then(() =>
                      reexecute({ requestPolicy: "network-only" })
                    );
                  }, "plain-text", item.content);
                },
              });
              actions.push({
                text: "🗑️ Delete",
                style: "destructive",
                onPress: () => {
                  Alert.alert("Delete Message", "This cannot be undone.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () => {
                        if (!profileId) return;
                        executeDeleteMessage({ messageId: item.id, profileId }).then(() =>
                          reexecute({ requestPolicy: "network-only" })
                        );
                      },
                    },
                  ]);
                },
              });
            }
            actions.push({ text: "Cancel", style: "cancel" });
            Alert.alert("Message", undefined, actions);
          }

          // Bubble corner radius — flatten corner toward tail
          const myBubbleRadius = { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: isBottomOfGroup ? 4 : 18 };
          const theirBubbleRadius = { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: isBottomOfGroup ? 4 : 18, borderBottomRightRadius: 18 };

          return (
            <View style={{ paddingHorizontal: 12, marginBottom: isBottomOfGroup ? 8 : 2, marginTop: isTopOfGroup ? 6 : 0 }}>
              <View style={{ flexDirection: "row", justifyContent: isMe ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 8 }}>
                {/* Avatar slot — 32px wide so messages align even when avatar hidden */}
                {!isMe && (
                  <View style={{ width: 32, alignSelf: "flex-end", marginBottom: 2 }}>
                    {isBottomOfGroup && (
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentSurface, justifyContent: "center", alignItems: "center" }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.accent }}>
                          {item.fromProfile.displayName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Bubble column */}
                <View style={{ maxWidth: "75%" }}>
                  {/* Sender name — only at top of group for others */}
                  {!isMe && isTopOfGroup && (
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.accent, marginBottom: 3, marginLeft: 2 }}>
                      {item.fromProfile.displayName}
                    </Text>
                  )}

                  <TouchableOpacity activeOpacity={0.85} onLongPress={showMessageActions} delayLongPress={350}>
                    <View style={[
                      { paddingHorizontal: 14, paddingVertical: 10 },
                      isMe
                        ? [{ backgroundColor: colors.accent }, myBubbleRadius]
                        : [{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }, theirBubbleRadius],
                    ]}>
                      <Text style={{ fontSize: 16, lineHeight: 23, color: isMe ? "#fff" : colors.text }}>
                        {item.content}
                      </Text>
                      {isBottomOfGroup && (
                        <Text style={{ fontSize: 11, alignSelf: "flex-end", marginTop: 4, color: isMe ? "rgba(255,255,255,0.65)" : colors.textMuted }}>
                          {formatChatTime(item.createdAt)}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>

                  {/* Attachments */}
                  {(item.attachments ?? []).length > 0 && (
                    <View style={{ gap: 6, marginTop: 4 }}>
                      {item.attachments.map((a: Attachment) => {
                        const mime = a.document.mimeType ?? "";
                        const icon = mime.startsWith("image/") ? "🖼️" : mime.startsWith("video/") ? "🎬" : mime.startsWith("audio/") ? "🎵" : mime === "application/pdf" ? "📄" : "📎";
                        const size = a.document.fileSize
                          ? a.document.fileSize > 1_000_000
                            ? `${(a.document.fileSize / 1_000_000).toFixed(1)} MB`
                            : `${Math.round(a.document.fileSize / 1024)} KB`
                          : null;
                        return (
                          <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: colors.border }}>
                            <Text style={{ fontSize: 16 }}>{icon}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 12, fontWeight: "500", color: colors.text }} numberOfLines={1}>
                                {a.document.fileName || a.document.title}
                              </Text>
                              {size && <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>{size}</Text>}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Reactions */}
                  {reactionList.length > 0 && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4, justifyContent: isMe ? "flex-end" : "flex-start" }}>
                      {reactionList.map((r) => (
                        <TouchableOpacity
                          key={r.emoji}
                          style={[
                            { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
                            r.iMine
                              ? { backgroundColor: colors.accentSurface, borderColor: isDark ? colors.accent : "#93c5fd" }
                              : { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                          ]}
                          onPress={() => handleReact(r.emoji)}
                        >
                          <Text style={{ fontSize: 13 }}>{r.emoji}</Text>
                          <Text style={{ fontSize: 12, fontWeight: "600", color: r.iMine ? colors.accent : colors.textSecondary }}>
                            {r.count}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={{ borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, backgroundColor: colors.surfaceAlt, borderColor: colors.border, justifyContent: "center", alignItems: "center" }}
                        onPress={showMessageActions}
                      >
                        <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: "600" }}>+</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        }}
      />
      {/* Members panel */}
      <Modal
        visible={membersOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setMembersOpen(false)}
      >
        <View className="flex-1 bg-gray-50 dark:bg-slate-900">
          <View className="flex-row justify-between items-center p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <Text className="text-lg font-semibold text-gray-900 dark:text-slate-100">
              Members ({channel?.members.length ?? 0})
            </Text>
            <TouchableOpacity onPress={() => setMembersOpen(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

          {/* Join / Leave row */}
          <View className="flex-row gap-2.5 px-4 py-2.5 border-b border-gray-100 dark:border-slate-700">
            {isMember ? (
              <TouchableOpacity
                className="flex-1 py-2.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 items-center"
                onPress={() => {
                  if (!profileId) return;
                  Alert.alert("Leave Channel", "You will no longer receive messages from this channel.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Leave",
                      style: "destructive",
                      onPress: async () => {
                        await executeLeave({ channelId: id, profileId });
                        reexecuteChannel({ requestPolicy: "network-only" });
                      },
                    },
                  ]);
                }}
                activeOpacity={0.7}
              >
                <Text className="text-red-600 font-semibold text-sm">Leave Channel</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                className="flex-1 py-2.5 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 items-center"
                onPress={async () => {
                  if (!profileId) return;
                  await executeJoin({ channelId: id, profileId });
                  reexecuteChannel({ requestPolicy: "network-only" });
                }}
                activeOpacity={0.7}
              >
                <Text className="text-green-600 font-semibold text-sm">Join Channel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              className="flex-1 py-2.5 rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 items-center"
              onPress={() => { setMembersOpen(false); setTimeout(() => setAddMemberOpen(true), 300); }}
              activeOpacity={0.7}
            >
              <Text className="text-blue-600 font-semibold text-sm">+ Add Member</Text>
            </TouchableOpacity>
          </View>

          {/* Delete channel — only for creator */}
          {channel?.createdByProfileId === profileId && (
            <TouchableOpacity
              className="mx-4 mt-2.5 py-2.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 items-center"
              onPress={() => {
                if (!profileId) return;
                Alert.alert(
                  "Delete Channel",
                  `Permanently delete #${channel.name} and all its messages? This cannot be undone.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: async () => {
                        const res = await executeDeleteChannel({ channelId: id, profileId });
                        if (res.error) {
                          Alert.alert("Error", "Failed to delete channel");
                        } else {
                          setMembersOpen(false);
                          router.replace("/(dashboard)/channels" as Parameters<typeof router.replace>[0]);
                        }
                      },
                    },
                  ],
                );
              }}
              activeOpacity={0.7}
            >
              <Text className="text-red-600 font-semibold text-sm">Delete Channel</Text>
            </TouchableOpacity>
          )}

          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
            {(channel?.members ?? []).map((m) => (
              <View key={m.id} className="flex-row items-center p-3.5 gap-3 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700">
                <View className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 justify-center items-center">
                  <Text className="text-base font-bold text-blue-700 dark:text-blue-300">
                    {m.profile.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-base font-medium text-gray-900 dark:text-slate-100">{m.profile.displayName}</Text>
                  <Text className="text-xs text-gray-400 dark:text-slate-500 mt-px">
                    {m.profile.kind === "agent" ? "🤖 Agent" : "👤 Human"} · @{m.profile.username}
                  </Text>
                </View>
                {m.profileId === profileId ? (
                  <Text className="text-xs text-blue-600 font-semibold bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-xl">you</Text>
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      if (!profileId) return;
                      Alert.alert("Remove Member", `Remove ${m.profile.displayName} from this channel?`, [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: async () => {
                            await executeRemoveMember({ channelId: id, profileId: m.profileId, removedByProfileId: profileId });
                            reexecuteChannel({ requestPolicy: "network-only" });
                          },
                        },
                      ]);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="person-remove-outline" size={16} color="#9ca3af" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Add Member modal */}
      <Modal
        visible={addMemberOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAddMemberOpen(false)}
      >
        <View className="flex-1 bg-gray-50 dark:bg-slate-900">
          <View className="flex-row justify-between items-center p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <Text className="text-lg font-semibold text-gray-900 dark:text-slate-100">Add Member</Text>
            <TouchableOpacity onPress={() => setAddMemberOpen(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
          <View className="px-4 py-2.5 border-b border-gray-100 dark:border-slate-700">
            <View className="flex-row items-center bg-gray-100 dark:bg-slate-700 rounded-xl px-3 gap-2">
              <Ionicons name="search-outline" size={16} color="#9ca3af" />
              <TextInput
                className="flex-1 text-sm text-gray-900 dark:text-slate-100 py-2.5"
                placeholder="Search by name or username…"
                placeholderTextColor="#9ca3af"
                value={profileSearch}
                onChangeText={setProfileSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
            {profilesResult.fetching && filteredProfiles.length === 0 ? (
              <View className="p-6 items-center">
                <ActivityIndicator color="#2563eb" />
              </View>
            ) : filteredProfiles.length === 0 ? (
              <View className="p-6 items-center">
                <Text className="text-gray-400 dark:text-slate-500 text-sm">
                  {profileSearch.trim() ? "No matching profiles" : "All profiles are already members"}
                </Text>
              </View>
            ) : (
              filteredProfiles.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  className="flex-row items-center justify-between p-3.5 gap-3 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700"
                  onPress={async () => {
                    if (!profileId) return;
                    await executeAddMember({ channelId: id, profileId: p.id, addedByProfileId: profileId });
                    reexecuteChannel({ requestPolicy: "network-only" });
                    setAddMemberOpen(false);
                    setProfileSearch("");
                  }}
                  activeOpacity={0.7}
                >
                  <View className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 justify-center items-center">
                    <Text className="text-base font-bold text-blue-700 dark:text-blue-300">{p.displayName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-medium text-gray-900 dark:text-slate-100">{p.displayName}</Text>
                    <Text className="text-xs text-gray-400 dark:text-slate-500 mt-px">
                      {p.kind === "agent" ? "🤖 Agent" : "👤 Human"}{p.username ? ` · @${p.username}` : ""}
                    </Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={22} color="#2563eb" />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Pinned messages modal */}
      <Modal
        visible={pinnedOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPinnedOpen(false)}
      >
        <View className="flex-1 bg-gray-50 dark:bg-slate-900">
          <View className="flex-row justify-between items-center p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <Text className="text-lg font-semibold text-gray-900 dark:text-slate-100">
              📌 Pinned Messages ({pinnedMessages.length})
            </Text>
            <TouchableOpacity onPress={() => setPinnedOpen(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}>
            {pinnedMessages.map((msg) => (
              <View key={msg.id} className="bg-white dark:bg-slate-800 rounded-xl p-3 gap-2 border border-gray-200 dark:border-slate-700">
                <View className="flex-row items-center gap-2">
                  <View className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 justify-center items-center">
                    <Text className="text-blue-600 text-sm font-semibold">
                      {msg.fromProfile.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text className="text-xs font-semibold text-blue-600">{msg.fromProfile.displayName}</Text>
                  <Text className="text-xs text-gray-400 dark:text-slate-500">{formatChatTime(msg.createdAt)}</Text>
                </View>
                <Text className="text-sm text-gray-700 dark:text-slate-300 leading-5">{msg.content}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <View
        className="flex-row items-end pt-3 px-3 gap-2.5 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700"
        style={{ paddingBottom: insets.bottom + 8 }}
      >
        <MentionInput
          className="flex-1 bg-gray-100 dark:bg-slate-700 rounded-2xl px-4 pt-2.5 pb-2.5 text-base text-gray-900 dark:text-slate-100 max-h-24"
          placeholder="Message..."
          placeholderTextColor="#9ca3af"
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={2000}
          editable={!sending}
          suggestionsAbove
        />
        <TouchableOpacity
          className={`w-10 h-10 rounded-full justify-center items-center${(!message.trim() || sending) ? " bg-blue-300 dark:bg-blue-400" : " bg-blue-600"}`}
          onPress={handleSend}
          disabled={!message.trim() || sending}
          activeOpacity={0.8}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white text-lg font-bold">↑</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
