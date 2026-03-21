"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useSubscription, useClient } from "urql";
import { MESSAGES_BY_TASK_CONNECTION_QUERY } from "../../lib/graphql/queries";
import { CREATE_MESSAGE } from "../../lib/graphql/mutations";
import {
  MESSAGE_CREATED_SUBSCRIPTION,
  MESSAGE_REACTION_CHANGED_SUBSCRIPTION,
} from "../../lib/graphql/subscriptions";
import { MarkdownEditor } from "../common/MarkdownEditor";
import { TimeAgo } from "../common/TimeAgo";
import { MarkdownWithMentions } from "../common/MarkdownWithMentions";
import { CopyButton } from "../common/CopyButton";
import { MessageReactions } from "./MessageReactions";
import { Button } from "../ui";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { ProfileAvatar } from "../ui/ProfileAvatar";
import { useAppContext } from "../context/AppContext";
import type { TaskMessage } from "@agentcenter/types";

interface TaskCommentsProps {
  taskId: string;
}

export function TaskComments({ taskId }: TaskCommentsProps) {
  const [newComment, setNewComment] = useState("");
  const [isSending, setIsSending] = useState(false);
  const { currentUserProfile } = useAppContext();
  const client = useClient();

  const [connectionResult] = useQuery({
    query: MESSAGES_BY_TASK_CONNECTION_QUERY,
    variables: { taskId, first: 100, before: null },
    pause: !taskId,
    requestPolicy: "cache-and-network",
  });
  const connection = connectionResult.data?.messagesByTaskConnection;
  const latestMessages = connection?.messages ?? [];
  const hasOlderFromLatest = connection?.hasOlder ?? false;
  const isFetching = connectionResult.fetching;

  // Older batches loaded on scroll-up (appended: newest-first, reversed for display)
  const [olderBatches, setOlderBatches] = useState<
    Array<{ messages: TaskMessage[]; hasOlder: boolean }>
  >([]);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const hasOlderToShow =
    olderBatches.length > 0 ? olderBatches[olderBatches.length - 1].hasOlder : hasOlderFromLatest;
  const oldestMessageId =
    olderBatches.length > 0
      ? olderBatches[olderBatches.length - 1].messages[0]?.id
      : latestMessages[0]?.id;

  const loadOlder = useCallback(async () => {
    if (!oldestMessageId || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const result = await client
        .query(MESSAGES_BY_TASK_CONNECTION_QUERY, {
          taskId,
          first: 50,
          before: oldestMessageId,
        })
        .toPromise();
      const data = result.data?.messagesByTaskConnection;
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
  }, [client, taskId, oldestMessageId, loadingOlder]);

  // Reset on taskId change
  useEffect(() => {
    setOlderBatches([]);
    isInitialLoadRef.current = true;
    prevCountRef.current = 0;
  }, [taskId]);

  // Subscribe to new messages — graphcache inserts into cached list automatically
  useSubscription({ query: MESSAGE_CREATED_SUBSCRIPTION, variables: { taskId }, pause: !taskId });

  // Graphcache auto-merges reaction updates on existing message entities — no refetch needed
  useSubscription({
    query: MESSAGE_REACTION_CHANGED_SUBSCRIPTION,
    variables: { taskId },
    pause: !taskId,
  });

  const [, executeCreateMessage] = useMutation(CREATE_MESSAGE);

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  // Optimistic messages shown instantly before server confirms
  const [optimisticMessages, setOptimisticMessages] = useState<
    (TaskMessage & { _optimistic?: boolean })[]
  >([]);

  const allServerMessages = useMemo(
    () => [
      ...olderBatches
        .slice()
        .reverse()
        .flatMap((b) => b.messages),
      ...latestMessages,
    ],
    [olderBatches, latestMessages],
  );

  // Clear optimistic messages when server data refreshes
  useEffect(() => {
    if (allServerMessages.length > 0) {
      setOptimisticMessages((prev) =>
        prev.filter(
          (o) =>
            !allServerMessages.some(
              (m: TaskMessage) => m.content === o.content && m.fromProfileId === o.fromProfileId,
            ),
        ),
      );
    }
  }, [allServerMessages]);

  // Messages from GraphQL are already sorted; append optimistic ones at the end
  const messages = useMemo(() => {
    return [...allServerMessages, ...optimisticMessages];
  }, [allServerMessages, optimisticMessages]);

  // Auto-scroll to bottom on initial load and new messages
  useEffect(() => {
    if (!scrollRef.current) return;
    const count = messages.length;
    const prevCount = prevCountRef.current;

    if (isInitialLoadRef.current && count > 0 && !isFetching) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      isInitialLoadRef.current = false;
    } else if (count > prevCount && prevCount > 0) {
      const el = scrollRef.current;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }

    prevCountRef.current = count;
  }, [messages.length, isFetching]);

  // IntersectionObserver for scroll-up loading
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
  }, [hasOlderToShow, loadingOlder, loadOlder]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUserProfile) return;

    const content = newComment;

    // Optimistic: show message instantly
    setOptimisticMessages((prev) => [
      ...prev,
      {
        id: `optimistic-${Date.now()}`,
        taskId,
        fromProfileId: currentUserProfile.id,
        content,
        createdAt: new Date().toISOString(),
        fromProfile: {
          id: currentUserProfile.id,
          displayName: currentUserProfile.displayName,
          username: currentUserProfile.username,
          avatarUrl: currentUserProfile.avatarUrl,
        },
        mentions: [],
        reactions: [],
        _optimistic: true,
      },
    ]);
    setNewComment("");
    setIsSending(true);

    // Fire mutation in background
    executeCreateMessage({ taskId, fromProfileId: currentUserProfile.id, content }).then(
      (result) => {
        setIsSending(false);
        if (result.error) {
          toast.error("Failed to send comment. Please try again.");
          setOptimisticMessages((prev) => prev.filter((m) => m.content !== content));
        }
      },
    );
  };

  if (isFetching && latestMessages.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <div className="animate-pulse flex items-center gap-2 text-sm">
          <div className="w-4 h-4 rounded-full bg-muted" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4">
        {hasOlderToShow && (
          <div ref={topSentinelRef} className="flex justify-center py-2">
            {loadingOlder && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
          </div>
        )}
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-3">
              <MessageCircle className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground font-medium">No comments yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">Start the conversation</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message: TaskMessage & { _optimistic?: boolean }) => {
              const sender = message.fromProfile;
              return (
                <div
                  key={message.id}
                  className={`flex gap-3 group ${message._optimistic ? "animate-pulse" : ""}`}
                >
                  {/* Avatar */}
                  <div className={`shrink-0 ${message._optimistic ? "opacity-50" : ""}`}>
                    {sender?.id ? (
                      <ProfileAvatar profileId={sender.id} size="sm+" />
                    ) : (
                      <ProfileAvatar name={sender?.displayName} size="sm+" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={`text-sm font-semibold ${message._optimistic ? "text-muted-foreground" : "text-foreground"}`}
                      >
                        {sender?.displayName || "Unknown"}
                      </span>
                      {message._optimistic ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Sending...
                        </span>
                      ) : (
                        <>
                          <TimeAgo
                            date={message.createdAt}
                            className="text-xs text-muted-foreground"
                          />
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <CopyButton text={message.content} />
                          </div>
                        </>
                      )}
                    </div>
                    <div
                      className={`text-sm ${message._optimistic ? "text-muted-foreground" : "text-foreground"}`}
                    >
                      <MarkdownWithMentions content={message.content} />
                    </div>
                    {!message._optimistic && (
                      <MessageReactions
                        messageId={message.id}
                        reactions={
                          (message.reactions ?? []) as {
                            id: string;
                            messageId: string;
                            profileId: string;
                            emoji: string;
                            profile: { id: string; displayName: string; username?: string | null };
                          }[]
                        }
                        currentProfileId={currentUserProfile?.id}
                        currentProfileName={currentUserProfile?.displayName}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Input */}
      {currentUserProfile && (
        <form
          onSubmit={handleSubmit}
          className="shrink-0 p-3 sm:p-4 border-t border-border bg-background space-y-2.5"
        >
          <MarkdownEditor
            value={newComment}
            onChange={setNewComment}
            placeholder="Write a comment... (@ to mention)"
            rows={3}
          />
          <div className="flex items-center justify-end">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!newComment.trim() || isSending}
              icon={isSending ? <Loader2 className="animate-spin" /> : <Send />}
            >
              {isSending ? "Sending" : "Send"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
