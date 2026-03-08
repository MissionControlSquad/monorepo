"use client";

import { useState, useEffect, useCallback } from "react";
import { useMutation } from "urql";
import { TOGGLE_CHANNEL_MESSAGE_REACTION } from "../../lib/graphql/mutations";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui";

export const EMOJI_MAP: Record<string, string> = {
  "thumbs-up": "\ud83d\udc4d",
  heart: "\u2764\ufe0f",
  eyes: "\ud83d\udc40",
  checkmark: "\u2705",
  party: "\ud83c\udf89",
  think: "\ud83e\udd14",
};

export const EMOJI_KEYS = Object.keys(EMOJI_MAP);

interface Reaction {
  id: string;
  profileId: string;
  emoji: string;
  profile: { id: string; displayName: string; username?: string | null };
}

interface ChannelMessageReactionsProps {
  messageId: string;
  reactions: Reaction[];
  currentProfileId: string | undefined;
  currentProfileName?: string;
}

export function ChannelMessageReactions({
  messageId,
  reactions,
  currentProfileId,
  currentProfileName,
}: ChannelMessageReactionsProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [, executeToggle] = useMutation(TOGGLE_CHANNEL_MESSAGE_REACTION);
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPendingToggles(new Set());
  }, [reactions]);

  const grouped = new Map<string, { count: number; names: string[]; hasReacted: boolean }>();
  for (const r of reactions) {
    const entry = grouped.get(r.emoji) ?? { count: 0, names: [], hasReacted: false };
    entry.count++;
    entry.names.push(r.profile?.displayName ?? "?");
    if (r.profileId === currentProfileId) entry.hasReacted = true;
    grouped.set(r.emoji, entry);
  }
  for (const emoji of pendingToggles) {
    const entry = grouped.get(emoji);
    if (entry && entry.hasReacted) {
      entry.count--;
      entry.hasReacted = false;
      if (entry.count <= 0) grouped.delete(emoji);
    } else if (entry) {
      entry.count++;
      entry.hasReacted = true;
    } else {
      grouped.set(emoji, { count: 1, names: [currentProfileName ?? "You"], hasReacted: true });
    }
  }

  const handleToggle = useCallback(
    (emoji: string) => {
      if (!currentProfileId) return;
      setPendingToggles((prev) => {
        const next = new Set(prev);
        if (next.has(emoji)) next.delete(emoji);
        else next.add(emoji);
        return next;
      });
      executeToggle({ messageId, profileId: currentProfileId, emoji });
      setShowPicker(false);
    },
    [currentProfileId, messageId, executeToggle],
  );

  if (grouped.size === 0) return null;

  return (
    <div className="flex items-center gap-1 mt-1 flex-wrap">
      {Array.from(grouped.entries()).map(([emoji, { count, names, hasReacted }]) => (
        <Button
          key={emoji}
          type="button"
          variant="secondary"
          size="xs"
          onClick={() => handleToggle(emoji)}
          title={names.join(", ")}
          className={`inline-flex items-center gap-1 rounded-full h-auto px-1.5 py-0.5 text-xs ${
            hasReacted
              ? "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
              : "bg-muted border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          <span>{EMOJI_MAP[emoji] ?? emoji}</span>
          <span>{count}</span>
        </Button>
      ))}
      <div className="relative">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setShowPicker((v) => !v)}
          className="rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Add reaction"
        >
          <Smile className="w-3.5 h-3.5" />
        </Button>
        {showPicker && (
          <div className="absolute bottom-full left-0 mb-1 flex items-center gap-0.5 bg-background border border-border rounded-lg shadow-lg px-1.5 py-1 z-10">
            {EMOJI_KEYS.map((key) => (
              <Button
                key={key}
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => handleToggle(key)}
                className="w-7 h-7 text-base"
                title={key}
              >
                {EMOJI_MAP[key]}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
