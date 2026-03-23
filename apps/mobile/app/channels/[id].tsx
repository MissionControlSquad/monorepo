import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
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
import { formatChatTime } from "@agentcenter/utils";
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
  const allIds = new Set(baseMessages.map((m) => m.id));
  const merged = [...baseMessages, ...liveMessages.filter((m: Message) => !allIds.has(m.id))];
  const messages = merged;
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && messages.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load messages</Text>
      </View>
    );
  }

  const searchMessages = searchResult.data?.searchChannelMessages ?? [];
  const displayMessages = searchOpen && searchQuery.trim().length >= 2 ? searchMessages : messages;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 + insets.bottom : 0}
    >
      {/* Search bar */}
      {searchOpen && (
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
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
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListHeaderComponent={
          pinnedMessages.length > 0 ? (
            <TouchableOpacity
              style={styles.pinnedBanner}
              onPress={() => setPinnedOpen(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.pinnedBannerIcon}>📌</Text>
              <Text style={styles.pinnedBannerText}>
                {pinnedMessages.length} pinned {pinnedMessages.length === 1 ? "message" : "messages"}
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#92400e" />
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
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
            <View style={[styles.messageRow, isMe && styles.messageRowMe]}>
              {!isMe && (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {item.fromProfile.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.bubbleCol}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onLongPress={showMessageActions}
                  delayLongPress={350}
                >
                  <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                    {!isMe && (
                      <Text style={styles.senderName}>{item.fromProfile.displayName}</Text>
                    )}
                    <Text style={[styles.messageText, isMe && styles.messageTextMe]}>
                      {item.content}
                    </Text>
                    <Text style={[styles.timestamp, isMe && styles.timestampMe]}>
                      {formatChatTime(item.createdAt)}
                    </Text>
                  </View>
                </TouchableOpacity>
                {(item.attachments ?? []).length > 0 && (
                  <View style={styles.attachmentsRow}>
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
                        <View key={a.id} style={styles.attachmentPill}>
                          <Text style={styles.attachmentIcon}>{icon}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.attachmentName} numberOfLines={1}>
                              {a.document.fileName || a.document.title}
                            </Text>
                            {size && <Text style={styles.attachmentSize}>{size}</Text>}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
                {reactionList.length > 0 && (
                  <View style={[styles.reactionsRow, isMe && styles.reactionsRowMe]}>
                    {reactionList.map((r) => (
                      <TouchableOpacity
                        key={r.emoji}
                        style={[styles.reactionPill, r.iMine && styles.reactionPillMine]}
                        onPress={() => handleReact(r.emoji)}
                      >
                        <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                        <Text style={[styles.reactionCount, r.iMine && styles.reactionCountMine]}>
                          {r.count}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.addReactionBtn} onPress={showMessageActions}>
                      <Text style={styles.addReactionText}>+</Text>
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
        <View style={styles.membersModal}>
          <View style={styles.membersHeader}>
            <Text style={styles.membersTitle}>
              Members ({channel?.members.length ?? 0})
            </Text>
            <TouchableOpacity onPress={() => setMembersOpen(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

          {/* Join / Leave row */}
          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
            {isMember ? (
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2", alignItems: "center" }}
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
                <Text style={{ color: "#dc2626", fontWeight: "600", fontSize: 14 }}>Leave Channel</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: "#bbf7d0", backgroundColor: "#f0fdf4", alignItems: "center" }}
                onPress={async () => {
                  if (!profileId) return;
                  await executeJoin({ channelId: id, profileId });
                  reexecuteChannel({ requestPolicy: "network-only" });
                }}
                activeOpacity={0.7}
              >
                <Text style={{ color: "#16a34a", fontWeight: "600", fontSize: 14 }}>Join Channel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: "#bfdbfe", backgroundColor: "#eff6ff", alignItems: "center" }}
              onPress={() => { setMembersOpen(false); setTimeout(() => setAddMemberOpen(true), 300); }}
              activeOpacity={0.7}
            >
              <Text style={{ color: "#2563eb", fontWeight: "600", fontSize: 14 }}>+ Add Member</Text>
            </TouchableOpacity>
          </View>

          {/* Delete channel — only for creator */}
          {channel?.createdByProfileId === profileId && (
            <TouchableOpacity
              style={{ marginHorizontal: 16, marginTop: 10, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2", alignItems: "center" }}
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
              <Text style={{ color: "#dc2626", fontWeight: "600", fontSize: 14 }}>Delete Channel</Text>
            </TouchableOpacity>
          )}

          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
            {(channel?.members ?? []).map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>
                    {m.profile.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{m.profile.displayName}</Text>
                  <Text style={styles.memberMeta}>
                    {m.profile.kind === "agent" ? "🤖 Agent" : "👤 Human"} · @{m.profile.username}
                  </Text>
                </View>
                {m.profileId === profileId ? (
                  <Text style={styles.memberYou}>you</Text>
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
        <View style={styles.membersModal}>
          <View style={styles.membersHeader}>
            <Text style={styles.membersTitle}>Add Member</Text>
            <TouchableOpacity onPress={() => setAddMemberOpen(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#f3f4f6", borderRadius: 10, paddingHorizontal: 12, gap: 8 }}>
              <Ionicons name="search-outline" size={16} color="#9ca3af" />
              <TextInput
                style={{ flex: 1, fontSize: 14, color: "#111827", paddingVertical: 9 }}
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
              <View style={{ padding: 24, alignItems: "center" }}>
                <ActivityIndicator color="#2563eb" />
              </View>
            ) : filteredProfiles.length === 0 ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ color: "#9ca3af", fontSize: 14 }}>
                  {profileSearch.trim() ? "No matching profiles" : "All profiles are already members"}
                </Text>
              </View>
            ) : (
              filteredProfiles.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.memberRow, { justifyContent: "space-between" }]}
                  onPress={async () => {
                    if (!profileId) return;
                    await executeAddMember({ channelId: id, profileId: p.id, addedByProfileId: profileId });
                    reexecuteChannel({ requestPolicy: "network-only" });
                    setAddMemberOpen(false);
                    setProfileSearch("");
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>{p.displayName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{p.displayName}</Text>
                    <Text style={styles.memberMeta}>
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
        <View style={styles.membersModal}>
          <View style={styles.membersHeader}>
            <Text style={styles.membersTitle}>
              📌 Pinned Messages ({pinnedMessages.length})
            </Text>
            <TouchableOpacity onPress={() => setPinnedOpen(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}>
            {pinnedMessages.map((msg) => (
              <View key={msg.id} style={styles.pinnedMessageCard}>
                <View style={styles.pinnedMessageHeader}>
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>
                      {msg.fromProfile.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.senderName}>{msg.fromProfile.displayName}</Text>
                  <Text style={styles.timestamp}>{formatChatTime(msg.createdAt)}</Text>
                </View>
                <Text style={styles.pinnedMessageContent}>{msg.content}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <MentionInput
          style={styles.input}
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
          style={[styles.sendButton, (!message.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!message.trim() || sending}
          activeOpacity={0.8}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendIcon}>↑</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    paddingVertical: 4,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  listContent: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  emptyText: {
    color: "#9ca3af",
    fontSize: 15,
  },
  errorText: {
    color: "#dc2626",
    fontSize: 16,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 4,
  },
  messageRowMe: {
    justifyContent: "flex-end",
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#2563eb",
    fontSize: 14,
    fontWeight: "600",
  },
  bubble: {
    maxWidth: "75%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  bubbleThem: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  bubbleMe: {
    backgroundColor: "#2563eb",
    borderBottomRightRadius: 4,
  },
  senderName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563eb",
    marginBottom: 2,
  },
  messageText: {
    fontSize: 15,
    color: "#111827",
    lineHeight: 20,
  },
  messageTextMe: {
    color: "#fff",
  },
  timestamp: {
    fontSize: 11,
    color: "#9ca3af",
    alignSelf: "flex-end",
  },
  timestampMe: {
    color: "rgba(255,255,255,0.7)",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  input: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    color: "#111827",
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#93c5fd",
  },
  sendIcon: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },

  bubbleCol: { flexDirection: "column", gap: 4, maxWidth: "75%" },

  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    paddingLeft: 2,
  },
  reactionsRowMe: { justifyContent: "flex-end", paddingLeft: 0, paddingRight: 2 },
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  reactionPillMine: {
    backgroundColor: "#dbeafe",
    borderColor: "#93c5fd",
  },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, color: "#6b7280", fontWeight: "600" },
  reactionCountMine: { color: "#2563eb" },
  // Pinned banner
  pinnedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef3c7",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  pinnedBannerIcon: { fontSize: 14 },
  pinnedBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#92400e",
  },

  // Attachments
  attachmentsRow: {
    gap: 6,
    marginTop: 2,
  },
  attachmentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  attachmentIcon: { fontSize: 16 },
  attachmentName: {
    fontSize: 12,
    fontWeight: "500",
    color: "#374151",
  },
  attachmentSize: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 1,
  },

  // Pinned message card
  pinnedMessageCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  pinnedMessageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pinnedMessageContent: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },

  addReactionBtn: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
  },
  addReactionText: { fontSize: 13, color: "#9ca3af", fontWeight: "600" },

  // Members modal
  membersModal: { flex: 1, backgroundColor: "#f9fafb" },
  membersHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  membersTitle: { fontSize: 17, fontWeight: "600", color: "#111827" },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
  },
  memberAvatarText: { fontSize: 16, fontWeight: "700", color: "#1d4ed8" },
  memberName: { fontSize: 15, fontWeight: "500", color: "#111827" },
  memberMeta: { fontSize: 12, color: "#9ca3af", marginTop: 1 },
  memberYou: {
    fontSize: 11,
    color: "#2563eb",
    fontWeight: "600",
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
});
