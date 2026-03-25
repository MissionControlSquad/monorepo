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
              <Ionicons name={searchOpen ? "close" : "search-outline"} size={20} color="#2563eb" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMembersOpen(true)} style={{ padding: 8 }}>
              <Ionicons name="people-outline" size={22} color="#2563eb" />
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

  // Auto-scroll when new messages arrive via subscription
  useEffect(() => {
    if (liveMessages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [liveMessages.length]);

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
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
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

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50 dark:bg-slate-900"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 + insets.bottom : 0}
    >
      {/* Search bar */}
      {searchOpen && (
        <View className="flex-row items-center bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-3 py-2 gap-2">
          <Ionicons name="search-outline" size={16} color="#9ca3af" />
          <TextInput
            className="flex-1 text-[15px] text-gray-900 dark:text-slate-100 py-1"
            placeholder="Search messages…"
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={16} color="#9ca3af" />
            </TouchableOpacity>
          )}
          {searchResult.fetching && <ActivityIndicator size="small" color="#2563eb" style={{ marginLeft: 4 }} />}
        </View>
      )}
      <FlatList
        ref={searchOpen ? undefined : listRef}
        data={displayMessages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListHeaderComponent={
          pinnedMessages.length > 0 ? (
            <TouchableOpacity
              className="flex-row items-center gap-1.5 bg-yellow-100 dark:bg-yellow-900/30 rounded-[10px] px-3 py-2 mb-2 border border-yellow-200 dark:border-yellow-700"
              onPress={() => setPinnedOpen(true)}
              activeOpacity={0.8}
            >
              <Text className="text-sm">📌</Text>
              <Text className="flex-1 text-[13px] font-semibold text-yellow-800 dark:text-yellow-300">
                {pinnedMessages.length} pinned {pinnedMessages.length === 1 ? "message" : "messages"}
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#92400e" />
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View className="flex-1 justify-center items-center pt-[60px]">
            <Text className="text-gray-400 dark:text-slate-500 text-[15px]">
              {searchOpen && searchQuery.trim().length >= 2
                ? "No messages match your search"
                : searchOpen
                ? "Type at least 2 characters to search"
                : "No messages yet. Say hello!"}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMe = item.fromProfileId === profileId;

          // Group reactions by emoji
          const reactionGroups: Record<string, { emoji: string; count: number; iMine: boolean }> = {};
          for (const r of item.reactions ?? []) {
            if (!reactionGroups[r.emoji]) {
              reactionGroups[r.emoji] = { emoji: r.emoji, count: 0, iMine: false };
            }
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
            const baseActions: { text: string; onPress?: () => void; style?: "cancel" | "destructive" }[] = [
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
                    ...["👍","❤️","😂","🎉","🔥","👀"].map((e) => ({
                      text: e,
                      onPress: () => handleReact(e),
                    })),
                    { text: "Cancel", style: "cancel" as const },
                  ]);
                },
              },
            ];
            if (isMe) {
              baseActions.push({
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
              baseActions.push({
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
            baseActions.push({ text: "Cancel", style: "cancel" });
            Alert.alert("Message", undefined, baseActions);
          }

          return (
            <View className={`flex-row items-end gap-2 mb-1${isMe ? " justify-end" : ""}`}>
              {!isMe && (
                <View className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 justify-center items-center">
                  <Text className="text-blue-600 text-sm font-semibold">
                    {item.fromProfile.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View className="flex-col gap-1 max-w-[75%]">
                <TouchableOpacity
                  activeOpacity={0.85}
                  onLongPress={showMessageActions}
                  delayLongPress={350}
                >
                  <View
                    className={`max-w-[75%] rounded-2xl px-[14px] py-[10px] gap-1${
                      isMe
                        ? " bg-blue-600 rounded-br-[4px]"
                        : " bg-white dark:bg-slate-800 rounded-bl-[4px] border border-gray-200 dark:border-slate-700"
                    }`}
                  >
                    {!isMe && (
                      <Text className="text-xs font-semibold text-blue-600 mb-0.5">{item.fromProfile.displayName}</Text>
                    )}
                    <Text className={`text-[15px] leading-5${isMe ? " text-white" : " text-gray-900 dark:text-slate-100"}`}>
                      {item.content}
                    </Text>
                    <Text
                      className={`text-[11px] self-end${isMe ? "" : " text-gray-400 dark:text-slate-500"}`}
                      style={isMe ? { color: "rgba(255,255,255,0.7)" } : undefined}
                    >
                      {formatChatTime(item.createdAt)}
                    </Text>
                  </View>
                </TouchableOpacity>
                {(item.attachments ?? []).length > 0 && (
                  <View className="gap-1.5 mt-0.5">
                    {(item.attachments ?? []).map((a: Attachment) => {
                      const mime = a.document.mimeType ?? "";
                      const icon = mime.startsWith("image/") ? "🖼️"
                        : mime.startsWith("video/") ? "🎬"
                        : mime.startsWith("audio/") ? "🎵"
                        : mime === "application/pdf" ? "📄"
                        : "📎";
                      const size = a.document.fileSize
                        ? a.document.fileSize > 1_000_000
                          ? `${(a.document.fileSize / 1_000_000).toFixed(1)} MB`
                          : `${Math.round(a.document.fileSize / 1024)} KB`
                        : null;
                      return (
                        <View key={a.id} className="flex-row items-center gap-2 bg-gray-100 dark:bg-slate-700 rounded-lg px-2.5 py-[7px] border border-gray-200 dark:border-slate-600">
                          <Text className="text-base">{icon}</Text>
                          <View className="flex-1">
                            <Text className="text-xs font-medium text-gray-700 dark:text-slate-300" numberOfLines={1}>
                              {a.document.fileName || a.document.title}
                            </Text>
                            {size && <Text className="text-[11px] text-gray-400 dark:text-slate-500 mt-px">{size}</Text>}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
                {reactionList.length > 0 && (
                  <View className={`flex-row flex-wrap gap-1${isMe ? " justify-end pr-0.5" : " pl-0.5"}`}>
                    {reactionList.map((r) => (
                      <TouchableOpacity
                        key={r.emoji}
                        className={`flex-row items-center gap-[3px] rounded-xl px-[7px] py-[3px] border${
                          r.iMine
                            ? " bg-blue-100 dark:bg-blue-900/50 border-blue-300 dark:border-blue-600"
                            : " bg-gray-100 dark:bg-slate-700 border-gray-200 dark:border-slate-600"
                        }`}
                        onPress={() => handleReact(r.emoji)}
                      >
                        <Text className="text-[13px]">{r.emoji}</Text>
                        <Text className={`text-[11px] font-semibold${r.iMine ? " text-blue-600" : " text-gray-500 dark:text-slate-400"}`}>
                          {r.count}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      className="bg-gray-100 dark:bg-slate-700 rounded-xl px-2 py-[3px] border border-gray-200 dark:border-slate-600 justify-center items-center"
                      onPress={showMessageActions}
                    >
                      <Text className="text-[13px] text-gray-400 dark:text-slate-500 font-semibold">+</Text>
                    </TouchableOpacity>
                  </View>
                )}
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
            <Text className="text-[17px] font-semibold text-gray-900 dark:text-slate-100">
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
                className="flex-1 py-[9px] rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 items-center"
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
                className="flex-1 py-[9px] rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 items-center"
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
              className="flex-1 py-[9px] rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 items-center"
              onPress={() => { setMembersOpen(false); setTimeout(() => setAddMemberOpen(true), 300); }}
              activeOpacity={0.7}
            >
              <Text className="text-blue-600 font-semibold text-sm">+ Add Member</Text>
            </TouchableOpacity>
          </View>

          {/* Delete channel — only for creator */}
          {channel?.createdByProfileId === profileId && (
            <TouchableOpacity
              className="mx-4 mt-2.5 py-[9px] rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 items-center"
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
                <View className="w-[38px] h-[38px] rounded-[19px] bg-blue-100 dark:bg-blue-900/50 justify-center items-center">
                  <Text className="text-base font-bold text-blue-700 dark:text-blue-300">
                    {m.profile.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-medium text-gray-900 dark:text-slate-100">{m.profile.displayName}</Text>
                  <Text className="text-xs text-gray-400 dark:text-slate-500 mt-px">
                    {m.profile.kind === "agent" ? "🤖 Agent" : "👤 Human"} · @{m.profile.username}
                  </Text>
                </View>
                {m.profileId === profileId ? (
                  <Text className="text-[11px] text-blue-600 font-semibold bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-[10px]">you</Text>
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
            <Text className="text-[17px] font-semibold text-gray-900 dark:text-slate-100">Add Member</Text>
            <TouchableOpacity onPress={() => setAddMemberOpen(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
          <View className="px-4 py-2.5 border-b border-gray-100 dark:border-slate-700">
            <View className="flex-row items-center bg-gray-100 dark:bg-slate-700 rounded-[10px] px-3 gap-2">
              <Ionicons name="search-outline" size={16} color="#9ca3af" />
              <TextInput
                className="flex-1 text-sm text-gray-900 dark:text-slate-100 py-[9px]"
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
                  <View className="w-[38px] h-[38px] rounded-[19px] bg-blue-100 dark:bg-blue-900/50 justify-center items-center">
                    <Text className="text-base font-bold text-blue-700 dark:text-blue-300">{p.displayName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[15px] font-medium text-gray-900 dark:text-slate-100">{p.displayName}</Text>
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
            <Text className="text-[17px] font-semibold text-gray-900 dark:text-slate-100">
              📌 Pinned Messages ({pinnedMessages.length})
            </Text>
            <TouchableOpacity onPress={() => setPinnedOpen(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}>
            {pinnedMessages.map((msg) => (
              <View key={msg.id} className="bg-white dark:bg-slate-800 rounded-[10px] p-3 gap-2 border border-gray-200 dark:border-slate-700">
                <View className="flex-row items-center gap-2">
                  <View className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 justify-center items-center">
                    <Text className="text-blue-600 text-sm font-semibold">
                      {msg.fromProfile.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text className="text-xs font-semibold text-blue-600">{msg.fromProfile.displayName}</Text>
                  <Text className="text-[11px] text-gray-400 dark:text-slate-500">{formatChatTime(msg.createdAt)}</Text>
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
          className="flex-1 bg-gray-100 dark:bg-slate-700 rounded-[20px] px-4 pt-2.5 pb-2.5 text-[15px] text-gray-900 dark:text-slate-100 max-h-[100px]"
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
