"use client";

import { useState, useRef, useEffect, useMemo, useCallback, Fragment } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useSubscription, useClient } from "urql";
import {
  CHANNEL_QUERY,
  CHANNEL_MESSAGE_CONNECTION_QUERY,
  CHANNEL_PINNED_MESSAGES_QUERY,
  SEARCH_CHANNEL_MESSAGES_QUERY,
} from "../../lib/graphql/queries";
import {
  CREATE_CHANNEL_MESSAGE,
  JOIN_CHANNEL,
  UPDATE_CHANNEL_MESSAGE,
  DELETE_CHANNEL_MESSAGE,
  MARK_CHANNEL_READ,
  PIN_CHANNEL_MESSAGE,
  UNPIN_CHANNEL_MESSAGE,
  TOGGLE_CHANNEL_MESSAGE_REACTION,
} from "../../lib/graphql/mutations";
import {
  CHANNEL_MESSAGE_CREATED_SUBSCRIPTION,
  CHANNEL_MESSAGE_REACTION_CHANGED_SUBSCRIPTION,
} from "../../lib/graphql/subscriptions";
import { useAppContext } from "../context/AppContext";
import { useMentionData, useMentionSuggestions } from "../context/MentionDataContext";
import { MarkdownWithMentions, MentionText } from "../common/MarkdownWithMentions";
import { MentionTextArea } from "../common/MentionTextArea";
import { ChannelMessageContent } from "./ChannelMessageContent";
import { type MentionSuggestionCategory, MENTION_SUGGESTION_CATEGORIES } from "@agentcenter/utils";

import { ChannelMessageReactions, EMOJI_MAP, EMOJI_KEYS } from "./ChannelMessageReactions";
import { ChannelAttachment } from "./ChannelAttachment";
import { ChannelLinkPreview, extractFirstUrl } from "./ChannelLinkPreview";
import { ChannelInfoSidebar } from "./ChannelInfoSidebar";
import { useFileUpload, formatFileSize } from "../../hooks/useFileUpload";
import { useChannelsLayout } from "./ChannelsLayoutContext";
import { createPortal } from "react-dom";
import { ConfirmDialog, Button } from "../ui";
import type { ChannelMessage, ChannelMember, MessageAttachment } from "@agentcenter/types";
import { ProfileAvatar } from "../ui/ProfileAvatar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/shadcn/popover";
import {
  Send,
  Loader2,
  MessageCircle,
  Lock,
  Hash,
  Menu,
  Info,
  X,
  Pencil,
  Trash2,
  Pin,
  PinOff,
  Search,
  Paperclip,
  FileText,
  Smile,
} from "lucide-react";
import { TimeAgo } from "../common/TimeAgo";

interface ChannelViewProps {
  channelId: string;
  /** Which @mention suggestion categories to show. Default: all (profile, agent, task, project). */
  suggestionCategories?: MentionSuggestionCategory[];
}

export function ChannelView({ channelId, suggestionCategories }: ChannelViewProps) {
  const { currentUserProfile } = useAppContext();
  const channelsLayout = useChannelsLayout();
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<
    Array<{ id: string; content: string; fromProfileId: string; createdAt: string }>
  >([]);

  const {
    files: uploadFiles,
    addFiles,
    removeFile,
    clearFiles,
    isUploading,
    completedDocumentIds,
  } = useFileUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const client = useClient();
  const [olderBatches, setOlderBatches] = useState<
    Array<{ messages: ChannelMessage[]; hasOlder: boolean }>
  >([]);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [channelResult, reexecuteChannel] = useQuery({
    query: CHANNEL_QUERY,
    variables: { id: channelId },
    requestPolicy: "cache-and-network",
  });
  const [connectionResult] = useQuery({
    query: CHANNEL_MESSAGE_CONNECTION_QUERY,
    variables: { channelId, first: 100, before: null },
  });
  const [pinnedResult] = useQuery({
    query: CHANNEL_PINNED_MESSAGES_QUERY,
    variables: { channelId, limit: 50 },
  });
  const pinnedMessages = pinnedResult.data?.channelPinnedMessages ?? [];
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLTextAreaElement>(null);
  const [searchResult] = useQuery({
    query: SEARCH_CHANNEL_MESSAGES_QUERY,
    variables: {
      channelId,
      query: searchTerm.trim() || undefined,
      limit: 25,
    },
    pause: searchTerm.trim().length < 2,
  });
  const searchResults = searchResult.data?.searchChannelMessages ?? [];
  useSubscription({
    query: CHANNEL_MESSAGE_CREATED_SUBSCRIPTION,
    variables: { channelId },
  });
  useSubscription({
    query: CHANNEL_MESSAGE_REACTION_CHANGED_SUBSCRIPTION,
    variables: { channelId },
  });

  const channel = channelResult.data?.channel;
  const connection = connectionResult.data?.channelMessageConnection;
  const latestMessages = connection?.messages ?? [];
  const hasOlderFromLatest = connection?.hasOlder ?? false;
  const isFetchingChannel = channelResult.fetching;
  const isFetchingMessages = connectionResult.fetching;

  const hasOlderToShow =
    olderBatches.length > 0 ? olderBatches[olderBatches.length - 1].hasOlder : hasOlderFromLatest;
  const oldestMessageId =
    olderBatches.length > 0
      ? olderBatches[olderBatches.length - 1].messages[0]?.id
      : latestMessages[0]?.id;

  const loadOlder = async () => {
    if (!oldestMessageId || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const result = await client
        .query(CHANNEL_MESSAGE_CONNECTION_QUERY, {
          channelId,
          first: 50,
          before: oldestMessageId,
        })
        .toPromise();
      const data = result.data?.channelMessageConnection;
      if (data?.messages?.length) {
        const el = scrollRef.current;
        const prevHeight = el?.scrollHeight ?? 0;
        setOlderBatches((prev) => [...prev, { messages: data.messages, hasOlder: data.hasOlder }]);
        requestAnimationFrame(() => {
          if (el) el.scrollTop += el.scrollHeight - prevHeight;
        });
      }
    } finally {
      setLoadingOlder(false);
    }
  };

  const allServerMessages = useMemo(
    () => [
      // olderBatches are appended newest-first, so reverse to get chronological order
      ...olderBatches
        .slice()
        .reverse()
        .flatMap((b) => b.messages),
      ...latestMessages,
    ],
    [olderBatches, latestMessages],
  );
  const messages = useMemo(() => {
    const list = [...allServerMessages, ...optimisticMessages];
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return list;
  }, [allServerMessages, optimisticMessages]);

  useEffect(() => {
    setOlderBatches([]);
    isInitialLoadRef.current = true;
  }, [channelId]);

  // Close channel info sidebar when viewing a Direct message
  useEffect(() => {
    if (channel?.visibility === "dm" && channelsLayout?.infoSidebarOpen) {
      channelsLayout.closeInfoSidebar();
    }
  }, [
    channel?.visibility,
    channel?.id,
    channelsLayout?.infoSidebarOpen,
    channelsLayout?.closeInfoSidebar,
  ]);

  const { profileById, agentById, taskById, projectById } = useMentionData();
  const searchSuggestionSources = useMentionSuggestions();
  const postingProfile = currentUserProfile;
  const composerSuggestionSources = useMentionSuggestions(
    suggestionCategories ?? [...MENTION_SUGGESTION_CATEGORIES],
  );
  const mentionMaps = useMemo(
    () => ({ profileById, agentById, taskById, projectById }),
    [profileById, agentById, taskById, projectById],
  );

  useEffect(() => {
    if (optimisticMessages.length === 0) return;
    setOptimisticMessages((prev) =>
      prev.filter(
        (o) =>
          !allServerMessages.some(
            (m: ChannelMessage) => m.content === o.content && m.fromProfileId === o.fromProfileId,
          ),
      ),
    );
  }, [allServerMessages]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current || messages.length === 0) return;

    if (isInitialLoadRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      isInitialLoadRef.current = false;
      prevCountRef.current = messages.length;
      return;
    }

    const count = messages.length;
    if (count > prevCountRef.current) {
      const el = scrollRef.current;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }
    prevCountRef.current = count;
  }, [messages.length]);

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasOlderToShow || loadingOlder) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadOlder();
      },
      { root, rootMargin: "200px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasOlderToShow, loadingOlder, oldestMessageId]);

  const [, executeCreateMessage] = useMutation(CREATE_CHANNEL_MESSAGE);
  const [, executeUpdateMessage] = useMutation(UPDATE_CHANNEL_MESSAGE);
  const [, executeDeleteMessage] = useMutation(DELETE_CHANNEL_MESSAGE);
  const [, executeMarkChannelRead] = useMutation(MARK_CHANNEL_READ);
  const [, executePinMessage] = useMutation(PIN_CHANNEL_MESSAGE);
  const [, executeUnpinMessage] = useMutation(UNPIN_CHANNEL_MESSAGE);
  const [, executeJoin] = useMutation(JOIN_CHANNEL);

  // Mark channel as read when viewing it; refetch sidebar so unread badges update
  useEffect(() => {
    if (!channelId || !postingProfile?.id) return;
    executeMarkChannelRead({ channelId, profileId: postingProfile.id }).then(() => {
      channelsLayout?.refetchChannelList?.();
    });
  }, [channelId, postingProfile?.id, executeMarkChannelRead, channelsLayout?.refetchChannelList]);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [deleteConfirmMessageId, setDeleteConfirmMessageId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [, executeToggleReaction] = useMutation(TOGGLE_CHANNEL_MESSAGE_REACTION);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ top: number; right: number } | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToolbar = useCallback((msgId: string) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    const el = document.querySelector(`[data-message-id="${msgId}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setToolbarPos({ top: rect.top, right: window.innerWidth - rect.right + 16 });
    setHoveredMessageId(msgId);
  }, []);

  const hideToolbar = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredMessageId(null);
      setToolbarPos(null);
    }, 150);
  }, []);

  const keepToolbar = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if ((!newMessage.trim() && completedDocumentIds.length === 0) || !postingProfile) return;
    const content = newMessage.trim();

    if (editingMessageId) {
      setIsSending(true);
      try {
        await executeUpdateMessage({
          messageId: editingMessageId,
          profileId: postingProfile.id,
          content,
        });
        setNewMessage("");
        setEditingMessageId(null);
        toast.success("Message updated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update message");
      } finally {
        setIsSending(false);
      }
      return;
    }

    setNewMessage("");
    const attachmentIds = completedDocumentIds.length > 0 ? completedDocumentIds : undefined;

    // Build optimistic attachments from upload state
    const optimisticAttachments = uploadFiles
      .filter((f) => f.status === "complete" && f.documentId)
      .map((f) => ({
        id: `opt-att-${f.id}`,
        messageId: "",
        documentId: f.documentId!,
        document: {
          id: f.documentId!,
          title: f.file.name,
          type: "file",
          storageKey: null,
          fileName: f.file.name,
          mimeType: f.file.type,
          fileSize: f.file.size,
        },
      }));

    const optimisticId = `optimistic-${Date.now()}`;
    setOptimisticMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        content,
        fromProfileId: postingProfile.id,
        createdAt: new Date().toISOString(),
        attachments: optimisticAttachments.length > 0 ? optimisticAttachments : undefined,
      },
    ]);
    clearFiles();
    setIsSending(true);
    try {
      await executeCreateMessage({
        channelId,
        fromProfileId: postingProfile.id,
        content,
        attachmentIds,
      });
      // Mark channel read so our own message doesn't show as unread in the sidebar
      await executeMarkChannelRead({ channelId, profileId: postingProfile.id });
      channelsLayout?.refetchChannelList?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
      setOptimisticMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setNewMessage(content);
    } finally {
      setIsSending(false);
    }
  };

  const currentMembership = channel?.members?.find(
    (m: ChannelMember) => m.profileId === postingProfile?.id,
  );
  const isMember = !!currentMembership;
  const isChannelCreator = currentMembership?.role === "creator";
  const lastReadAt = currentMembership?.lastReadAt
    ? new Date(currentMembership.lastReadAt).getTime()
    : null;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files?.length) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  if (isFetchingChannel && !channel) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }
  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Channel not found
      </div>
    );
  }

  const Icon =
    channel.visibility === "private" ? Lock : channel.visibility === "dm" ? MessageCircle : Hash;

  // For DM channels, find the other member and extract agent status
  const dmOtherMember =
    channel.visibility === "dm" && channel.members?.length
      ? channel.members.find((m: ChannelMember) => m.profileId !== postingProfile?.id)
      : null;

  const headerTitle =
    channel.visibility === "dm" && dmOtherMember
      ? (dmOtherMember?.profile?.displayName ??
        dmOtherMember?.profile?.username ??
        "Direct message")
      : channel.name;

  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 flex flex-col min-h-0 bg-background min-w-0">
        <div className="shrink-0 px-4 py-3 border-b border-border bg-background flex items-center gap-2">
          {channelsLayout && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={channelsLayout.openChannelList}
              className="md:hidden shrink-0"
              aria-label="Open channel list"
            >
              <Menu className="w-5 h-5" />
            </Button>
          )}
          {channel.visibility === "dm" && dmOtherMember ? (
            <ProfileAvatar profileId={dmOtherMember.profileId} size="md" />
          ) : (
            <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold text-foreground truncate">{headerTitle}</h1>
            {channel.visibility !== "dm" && channel.description && (
              <p className="text-xs text-muted-foreground truncate">{channel.description}</p>
            )}
            {channel.visibility === "dm" && dmOtherMember && (
              <p className="text-xs text-muted-foreground truncate">
                {[
                  dmOtherMember.profile?.kind === "agent" ? "Agent" : "Human",
                  dmOtherMember.profile?.agent?.role,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          {/* Mobile search toggle */}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowSearch((v) => !v)}
            className={`md:hidden shrink-0 ${showSearch ? "bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-600" : ""}`}
            aria-label="Toggle search"
          >
            <Search className="w-5 h-5" />
          </Button>
          {channelsLayout && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={channelsLayout.openInfoSidebar}
              className="md:hidden shrink-0"
              aria-label="Channel info"
            >
              <Info className="w-5 h-5" />
            </Button>
          )}
        </div>

        <div
          className={`shrink-0 px-4 py-2 border-b border-border bg-background ${showSearch ? "block" : "hidden md:block"}`}
        >
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearchTerm(searchQuery.trim());
            }}
          >
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none z-10" />
              <MentionTextArea
                ref={searchInputRef}
                value={searchQuery}
                onChange={setSearchQuery}
                rows={1}
                placeholder="Search in channel (type @ to mention)"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                suggestionSources={searchSuggestionSources}
                mentionMaps={mentionMaps}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    setSearchTerm(searchQuery.trim());
                  }
                }}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={searchQuery.trim().length < 2}
            >
              Search
            </Button>
          </form>
          {searchTerm && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded border border-border bg-muted">
              {searchResult.fetching ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 px-3">
                  No messages match &quot;{searchTerm}&quot;.
                </p>
              ) : (
                <>
                  <p className="text-xs font-medium text-muted-foreground px-3 py-2 border-b border-border">
                    {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
                  </p>
                  <ul className="py-1">
                    {searchResults.map((msg: ChannelMessage) => (
                      <li key={msg.id}>
                        <button
                          type="button"
                          onClick={() => {
                            document
                              .querySelector(`[data-message-id="${msg.id}"]`)
                              ?.scrollIntoView({ behavior: "smooth", block: "center" });
                            setSearchQuery("");
                            setSearchTerm("");
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex flex-col gap-0.5"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground">
                              {msg.fromProfile?.displayName ?? "Unknown"}
                            </span>
                            <TimeAgo
                              date={msg.createdAt}
                              className="text-xs text-muted-foreground"
                            />
                          </div>
                          <span className="text-muted-foreground truncate">
                            <MentionText content={msg.content ?? ""} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain py-2">
          {pinnedMessages.length > 0 && (
            <div className="sticky top-0 z-10 mb-3 mx-5 p-2 rounded-lg border border-border bg-muted shadow-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Pin className="w-3.5 h-3.5" />
                Pinned ({pinnedMessages.length})
              </p>
              <ul className="space-y-1">
                {pinnedMessages.map((pm: ChannelMessage) => (
                  <li key={pm.id} className="flex items-center gap-1.5 group">
                    <button
                      type="button"
                      onClick={() => {
                        const el = document.querySelector(`[data-message-id="${pm.id}"]`);
                        if (el) {
                          el.scrollIntoView({ behavior: "smooth", block: "center" });
                          setHighlightedMessageId(pm.id);
                          setTimeout(() => setHighlightedMessageId(null), 2000);
                        }
                      }}
                      className="flex-1 min-w-0 flex items-center gap-2 text-left text-sm text-foreground hover:bg-muted rounded px-2 py-1.5"
                    >
                      <ProfileAvatar
                        profileId={pm.fromProfile?.id}
                        name={pm.fromProfile?.displayName}
                        size="xs"
                      />
                      <span className="font-medium text-foreground shrink-0">
                        {pm.fromProfile?.displayName ?? "Unknown"}
                      </span>
                      <span className="text-muted-foreground shrink-0">—</span>
                      <span className="truncate">
                        <MentionText content={pm.content ?? ""} />
                      </span>
                    </button>
                    {isMember && postingProfile?.id && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await executeUnpinMessage({
                              messageId: pm.id,
                              profileId: postingProfile.id,
                            });
                            toast.success("Message unpinned");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed to unpin");
                          }
                        }}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        title="Unpin"
                        aria-label="Unpin message"
                      >
                        <PinOff className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasOlderToShow && (
            <div ref={topSentinelRef} className="flex justify-center py-2">
              {loadingOlder && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
            </div>
          )}
          {isFetchingMessages && messages.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <MessageCircle className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No messages yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">Send a message below</p>
            </div>
          ) : (
            <div>
              {(() => {
                let unreadShown = false;
                return messages.map((msg: ChannelMessage, idx: number) => {
                  const profile = msg.fromProfile;
                  const displayName = profile?.displayName ?? "Unknown";
                  const isOptimistic = msg.id.startsWith("optimistic-");
                  const isCurrentlyEditing = editingMessageId === msg.id;
                  const isEdited =
                    msg.updatedAt &&
                    new Date(msg.updatedAt).getTime() !== new Date(msg.createdAt).getTime();

                  // Date separator: show when day changes between messages
                  const msgDate = new Date(msg.createdAt);
                  const prevMsg = idx > 0 ? messages[idx - 1] : null;
                  const prevDate = prevMsg ? new Date(prevMsg.createdAt) : null;
                  const showDateSep =
                    !prevDate || msgDate.toDateString() !== prevDate.toDateString();

                  // Message grouping: collapse avatar/name if same sender as previous and within 5 min (and same day)
                  const isGrouped =
                    prevMsg &&
                    !showDateSep &&
                    prevMsg.fromProfileId === msg.fromProfileId &&
                    !msg.id.startsWith("optimistic-") &&
                    Math.abs(msgDate.getTime() - new Date(prevMsg.createdAt).getTime()) <
                      5 * 60 * 1000;

                  // Format date label
                  const formatDateLabel = (d: Date) => {
                    const today = new Date();
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    if (d.toDateString() === today.toDateString()) return "Today";
                    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
                    return d.toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    });
                  };

                  return (
                    <Fragment key={msg.id}>
                      {showDateSep && (
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-xs font-medium text-muted-foreground shrink-0">
                            {formatDateLabel(msgDate)}
                          </span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}
                      {/* Unread marker */}
                      {!unreadShown &&
                        lastReadAt &&
                        !isOptimistic &&
                        msgDate.getTime() > lastReadAt &&
                        (prevMsg ? new Date(prevMsg.createdAt).getTime() <= lastReadAt : true) &&
                        (() => {
                          unreadShown = true;
                          return (
                            <div className="flex items-center gap-3 px-4 py-1">
                              <div className="flex-1 h-px bg-destructive" />
                              <span className="text-xs font-semibold text-destructive shrink-0">
                                New
                              </span>
                              <div className="flex-1 h-px bg-destructive" />
                            </div>
                          );
                        })()}
                      <div
                        key={msg.id}
                        data-message-id={msg.id}
                        onMouseEnter={() =>
                          !isOptimistic && editingMessageId !== msg.id && showToolbar(msg.id)
                        }
                        onMouseLeave={hideToolbar}
                        className={`group relative flex gap-3 w-full px-4 transition-colors duration-150 [content-visibility:auto] [contain-intrinsic-size:auto_2rem] ${
                          isGrouped ? "py-px" : "pt-1.5 pb-1"
                        } ${
                          highlightedMessageId === msg.id
                            ? "bg-warning-muted ring-2 ring-warning/30 transition-all duration-500"
                            : isCurrentlyEditing
                              ? "bg-indigo-50 ring-2 ring-indigo-200"
                              : "hover:bg-muted"
                        }`}
                      >
                        {isGrouped ? (
                          <div className="shrink-0 w-9" />
                        ) : (
                          <ProfileAvatar
                            {...(profile?.id ? { profileId: profile.id } : { name: displayName })}
                            size="md+"
                            className="mt-0.5"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          {!isGrouped && (
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="font-medium text-foreground text-sm">
                                {displayName}
                              </span>
                              <TimeAgo
                                date={msg.createdAt}
                                className="text-xs text-muted-foreground"
                              />
                              {isEdited && (
                                <span className="text-xs text-muted-foreground">(edited)</span>
                              )}
                              {isOptimistic && (
                                <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Sending…
                                </span>
                              )}
                            </div>
                          )}
                          {isGrouped && isEdited && (
                            <span className="text-xs text-muted-foreground">(edited)</span>
                          )}
                          <div className={`${isGrouped ? "" : "mt-0.5"} text-sm text-foreground`}>
                            {!isOptimistic ? (
                              <ChannelMessageContent content={msg.content} />
                            ) : (
                              <MarkdownWithMentions content={msg.content} />
                            )}
                          </div>
                          {!isOptimistic &&
                            (() => {
                              const linkUrl = extractFirstUrl(msg.content ?? "");
                              return linkUrl ? <ChannelLinkPreview url={linkUrl} /> : null;
                            })()}
                          {(msg.attachments ?? []).filter(
                            (a: MessageAttachment) =>
                              a.document?.storageKey || a.document?.fileName,
                          ).length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-2">
                              {(msg.attachments ?? [])
                                .filter(
                                  (a: MessageAttachment) =>
                                    a.document?.storageKey || a.document?.fileName,
                                )
                                .map((att: MessageAttachment) => (
                                  <ChannelAttachment key={att.id} attachment={att as any} />
                                ))}
                            </div>
                          )}
                          {!isOptimistic && (
                            <ChannelMessageReactions
                              messageId={msg.id}
                              reactions={(msg.reactions ?? []) as any}
                              currentProfileId={postingProfile?.id}
                              currentProfileName={postingProfile?.displayName}
                            />
                          )}
                        </div>
                        {/* Hover timestamp for grouped messages */}
                        {isGrouped && (
                          <span
                            className="shrink-0 self-center text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity select-none"
                            title={new Date(msg.createdAt).toLocaleString()}
                          >
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                    </Fragment>
                  );
                });
              })()}
            </div>
          )}
        </div>

        {/* Floating action toolbar — rendered via portal to avoid overflow clipping */}
        {hoveredMessageId &&
          toolbarPos &&
          (() => {
            const hovMsg = messages.find((m: ChannelMessage) => m.id === hoveredMessageId);
            if (!hovMsg) return null;
            const hovCanEditOrDelete =
              (hovMsg.fromProfileId === postingProfile?.id || isChannelCreator) &&
              !hovMsg.id.startsWith("optimistic-") &&
              postingProfile?.id;
            return createPortal(
              <div
                ref={toolbarRef}
                onMouseEnter={keepToolbar}
                onMouseLeave={hideToolbar}
                className="fixed z-50"
                style={{ top: toolbarPos.top, right: toolbarPos.right }}
              >
                <div className="flex items-center bg-background border border-border rounded-lg shadow-sm">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-foreground"
                        title="Add reaction"
                        aria-label="Add reaction"
                      >
                        <Smile className="w-4 h-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="top"
                      align="start"
                      className="w-auto p-1 flex items-center gap-0.5"
                    >
                      {EMOJI_KEYS.map((key) => (
                        <Button
                          key={key}
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="w-7 h-7 text-base"
                          title={key}
                          onClick={() => {
                            if (!postingProfile?.id) return;
                            executeToggleReaction({
                              messageId: hoveredMessageId,
                              profileId: postingProfile.id,
                              emoji: key,
                            });
                          }}
                        >
                          {EMOJI_MAP[key]}
                        </Button>
                      ))}
                    </PopoverContent>
                  </Popover>
                  {isMember && postingProfile?.id && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className={
                        hovMsg.pinnedAt
                          ? "text-warning hover:text-warning"
                          : "text-muted-foreground hover:text-foreground"
                      }
                      title={hovMsg.pinnedAt ? "Unpin message" : "Pin message"}
                      aria-label={hovMsg.pinnedAt ? "Unpin message" : "Pin message"}
                      onClick={async () => {
                        try {
                          if (hovMsg.pinnedAt) {
                            await executeUnpinMessage({
                              messageId: hovMsg.id,
                              profileId: postingProfile!.id,
                            });
                            toast.success("Message unpinned");
                          } else {
                            await executePinMessage({
                              messageId: hovMsg.id,
                              profileId: postingProfile!.id,
                            });
                            toast.success("Message pinned");
                          }
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed");
                        }
                      }}
                    >
                      {hovMsg.pinnedAt ? (
                        <PinOff className="w-4 h-4" />
                      ) : (
                        <Pin className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                  {hovCanEditOrDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-foreground"
                      title="Edit message"
                      aria-label="Edit message"
                      onClick={() => {
                        setEditingMessageId(hovMsg.id);
                        setNewMessage(hovMsg.content);
                        setHoveredMessageId(null);
                        requestAnimationFrame(() => textareaRef.current?.focus());
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                  {hovCanEditOrDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-destructive hover:text-destructive"
                      title="Delete message"
                      aria-label="Delete message"
                      onClick={() => {
                        setDeleteConfirmMessageId(hovMsg.id);
                        setHoveredMessageId(null);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>,
              document.body,
            );
          })()}

        {/* Delete confirmation dialog with message preview */}
        {(() => {
          const delMsg = deleteConfirmMessageId
            ? messages.find((m: ChannelMessage) => m.id === deleteConfirmMessageId)
            : null;
          return (
            <ConfirmDialog
              isOpen={!!deleteConfirmMessageId}
              onClose={() => setDeleteConfirmMessageId(null)}
              onConfirm={async () => {
                if (!postingProfile?.id || !deleteConfirmMessageId) return;
                try {
                  await executeDeleteMessage({
                    messageId: deleteConfirmMessageId,
                    profileId: postingProfile.id,
                  });
                  setDeleteConfirmMessageId(null);
                  toast.success("Message deleted");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to delete message");
                }
              }}
              title="Delete this message?"
              description="This can't be undone."
              confirmLabel="Delete"
              variant="danger"
            >
              {delMsg && (
                <div className="my-2 rounded-lg border border-border bg-muted p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ProfileAvatar
                      profileId={delMsg.fromProfile?.id}
                      name={delMsg.fromProfile?.displayName}
                      size="xs"
                    />
                    <span className="text-sm font-medium text-foreground">
                      {delMsg.fromProfile?.displayName ?? "Unknown"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(delMsg.createdAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="text-sm text-foreground line-clamp-3">
                    <ChannelMessageContent content={delMsg.content} />
                  </div>
                </div>
              )}
            </ConfirmDialog>
          );
        })()}

        <div className="shrink-0 border-t border-border bg-background p-3">
          {!isMember ? (
            <div className="flex items-center gap-2 py-2">
              <p className="text-sm text-muted-foreground">
                {postingProfile
                  ? "You're not a member. Join the channel to post."
                  : "Select an agent (in the app) to post messages."}
              </p>
              {channel.visibility === "public" && postingProfile && (
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await executeJoin({ channelId, profileId: postingProfile.id });
                      toast.success(`Joined #${channel.slug}`);
                      reexecuteChannel({ requestPolicy: "network-only" });
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to join");
                    }
                  }}
                >
                  Join channel
                </Button>
              )}
            </div>
          ) : (
            <form
              ref={formRef}
              onSubmit={handleSubmit}
              className="flex flex-col gap-2 relative"
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isDragging && (
                <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-indigo-400 bg-indigo-50/80 pointer-events-none">
                  <p className="text-sm font-medium text-indigo-600">Drop files to attach</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }
                }}
              />
              {editingMessageId &&
                (() => {
                  const editMsg = messages.find((m: ChannelMessage) => m.id === editingMessageId);
                  return (
                    <div className="flex items-start gap-2 py-1.5 px-3 rounded-lg bg-indigo-50 border border-indigo-100">
                      <Pencil className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-semibold text-indigo-700">
                          Editing message
                        </span>
                        {editMsg && (
                          <p className="text-xs text-indigo-600/70 truncate mt-0.5">
                            <MentionText content={editMsg.content ?? ""} />
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => {
                          setEditingMessageId(null);
                          setNewMessage("");
                        }}
                        className="text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100 shrink-0"
                        title="Cancel editing"
                        aria-label="Cancel editing"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })()}
              {uploadFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 py-1">
                  {uploadFiles.map((uf) => (
                    <div
                      key={uf.id}
                      className={`relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                        uf.status === "error"
                          ? "border-destructive/30 bg-destructive-muted text-destructive"
                          : "border-border bg-muted text-foreground"
                      }`}
                    >
                      {uf.previewUrl ? (
                        <img
                          src={uf.previewUrl}
                          alt=""
                          className="w-8 h-8 rounded object-cover shrink-0"
                        />
                      ) : (
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate max-w-[120px]">{uf.file.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatFileSize(uf.file.size)}
                        </p>
                      </div>
                      {uf.status === "uploading" && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500 shrink-0" />
                      )}
                      {uf.status === "error" && (
                        <span
                          className="text-[10px] text-destructive truncate max-w-[80px]"
                          title={uf.error}
                        >
                          {uf.error}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => removeFile(uf.id)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Remove file"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="relative rounded-lg border border-border focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
                <MentionTextArea
                  ref={textareaRef}
                  value={newMessage}
                  onChange={setNewMessage}
                  placeholder={
                    editingMessageId ? "Edit your message…" : "Message… Type @ to mention"
                  }
                  rows={1}
                  maxHeight="8rem"
                  className="w-full min-h-[2.5rem] resize-y px-3 py-2 border-0 rounded-lg text-sm focus:ring-0 focus:outline-none disabled:bg-muted"
                  disabled={isSending}
                  suggestionSources={composerSuggestionSources}
                  mentionMaps={mentionMaps}
                  dropdownPosition="portal"
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && editingMessageId) {
                      e.preventDefault();
                      setEditingMessageId(null);
                      setNewMessage("");
                      return;
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (newMessage.trim() || completedDocumentIds.length > 0)
                        formRef.current?.requestSubmit();
                    }
                  }}
                />
                <div className="flex items-center gap-1 px-2 pb-1.5">
                  {!editingMessageId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Attach file"
                      title="Attach file"
                    >
                      <Paperclip className="w-4 h-4" />
                    </Button>
                  )}
                  <div className="flex-1" />
                  <Button
                    type="submit"
                    size="icon-xs"
                    disabled={
                      (!newMessage.trim() && completedDocumentIds.length === 0) ||
                      isSending ||
                      isUploading
                    }
                    className="rounded-md"
                    title={editingMessageId ? "Save changes" : "Send message"}
                    aria-label={editingMessageId ? "Save changes" : "Send message"}
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
      <div className="hidden md:flex md:flex-col md:shrink-0 md:h-full md:min-h-0">
        <ChannelInfoSidebar
          channel={channel}
          currentProfileId={postingProfile?.id}
          onChannelUpdated={() => reexecuteChannel({ requestPolicy: "network-only" })}
        />
      </div>
      {channelsLayout?.infoSidebarOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              className="fixed inset-x-0 bottom-0 top-titlebar bg-black/30 z-[90] md:hidden"
              onClick={channelsLayout.closeInfoSidebar}
              aria-hidden
            />
            <div
              className="fixed bottom-0 top-titlebar right-0 w-[min(20rem,100vw)] z-[91] md:hidden flex flex-col bg-background border-l border-border shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-label="Channel info"
            >
              <div className="shrink-0 flex items-center justify-between px-3 py-3 border-b border-border">
                <span className="text-sm font-semibold text-gray-800">Channel info</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={channelsLayout.closeInfoSidebar}
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                <ChannelInfoSidebar
                  channel={channel}
                  currentProfileId={postingProfile?.id}
                  onChannelUpdated={() => reexecuteChannel({ requestPolicy: "network-only" })}
                  hideHeader
                />
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
