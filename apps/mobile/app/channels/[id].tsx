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
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useQuery, useMutation, useSubscription } from "urql";
import { useState, useEffect, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CHANNEL_MESSAGES_QUERY, CHANNEL_QUERY, CHANNEL_PINNED_MESSAGES_QUERY, ON_NEW_CHANNEL_MESSAGE } from "@agentcenter/graphql-client";
import { CREATE_CHANNEL_MESSAGE, MARK_CHANNEL_READ, TOGGLE_MESSAGE_REACTION } from "@agentcenter/graphql-client";
import { useAuth } from "../../src/context/AuthContext";
import { MentionInput } from "../../src/components/MentionInput";

interface FromProfile {
  id: string;
  kind: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
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
  members: { id: string; profileId: string; profile: { id: string; kind: string; displayName: string } }[];
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ChannelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const { profileId } = useAuth();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const listRef = useRef<FlatList>(null);

  const [channelResult] = useQuery<{ channel: Channel | null }>({
    query: CHANNEL_QUERY,
    variables: { id },
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

  const [, executeSend] = useMutation(CREATE_CHANNEL_MESSAGE);
  const [, executeMarkRead] = useMutation(MARK_CHANNEL_READ);
  const [, executeToggleReaction] = useMutation(TOGGLE_MESSAGE_REACTION);

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
          <TouchableOpacity onPress={() => setMembersOpen(true)} style={{ marginRight: 16, padding: 4 }}>
            <Ionicons name="people-outline" size={22} color="#2563eb" />
          </TouchableOpacity>
        ),
      });
    }
  }, [channel, navigation]);

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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 + insets.bottom : 0}
    >
      <FlatList
        ref={listRef}
        data={messages}
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
            <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
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

          function showEmojiPicker() {
            Alert.alert("React", undefined, [
              ...["👍","❤️","😂","🎉","🔥","👀"].map((e) => ({
                text: e,
                onPress: () => handleReact(e),
              })),
              { text: "Cancel", style: "cancel" },
            ]);
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
                  onLongPress={showEmojiPicker}
                  delayLongPress={400}
                >
                  <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                    {!isMe && (
                      <Text style={styles.senderName}>{item.fromProfile.displayName}</Text>
                    )}
                    <Text style={[styles.messageText, isMe && styles.messageTextMe]}>
                      {item.content}
                    </Text>
                    <Text style={[styles.timestamp, isMe && styles.timestampMe]}>
                      {formatTime(item.createdAt)}
                    </Text>
                  </View>
                </TouchableOpacity>
                {(item.attachments ?? []).length > 0 && (
                  <View style={styles.attachmentsRow}>
                    {(item.attachments ?? []).map((a) => {
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
                    <TouchableOpacity style={styles.addReactionBtn} onPress={showEmojiPicker}>
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
                {m.id === profileId && (
                  <Text style={styles.memberYou}>you</Text>
                )}
              </View>
            ))}
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
                  <Text style={styles.timestamp}>{formatTime(msg.createdAt)}</Text>
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
