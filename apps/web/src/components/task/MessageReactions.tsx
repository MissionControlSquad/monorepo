"use client";

import { useState, useEffect, useCallback } from "react";
import { useMutation } from "urql";
import { TOGGLE_MESSAGE_REACTION } from "../../lib/graphql/mutations";
import { Smile } from "lucide-react";
import { Button } from "../ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";

const EMOJI_MAP: Record<string, string> = {
  "thumbs-up": "\ud83d\udc4d",
  heart: "\u2764\ufe0f",
  eyes: "\ud83d\udc40",
  checkmark: "\u2705",
  party: "\ud83c\udf89",
  think: "\ud83e\udd14",
};

const EMOJI_KEYS = Object.keys(EMOJI_MAP);

interface Reaction {
  id: string;
  profileId: string;
  emoji: string;
  profile: { id: string; displayName: string; username?: string | null };
}

interface MessageReactionsProps {
  messageId: string;
  reactions: Reaction[];
  currentProfileId: string | undefined;
  currentProfileName?: string;
}

export function MessageReactions({
  messageId,
  reactions,
  currentProfileId,
  currentProfileName,
}: MessageReactionsProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [, executeToggle] = useMutation(TOGGLE_MESSAGE_REACTION);

  // Optimistic local state: track pending toggles as a Set of "emoji" keys
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());

  // Reset pending toggles when server data arrives (reactions prop changes)
  useEffect(() => {
    setPendingToggles(new Set());
  }, [reactions]);

  // Build grouped map with optimistic state applied
  const grouped = new Map<string, { count: number; agents: string[]; hasReacted: boolean }>();
  for (const r of reactions) {
    const entry = grouped.get(r.emoji) ?? { count: 0, agents: [], hasReacted: false };
    entry.count++;
    entry.agents.push(r.profile.displayName);
    if (r.profileId === currentProfileId) entry.hasReacted = true;
    grouped.set(r.emoji, entry);
  }

  // Apply optimistic toggles on top
  for (const emoji of pendingToggles) {
    const entry = grouped.get(emoji);
    if (entry && entry.hasReacted) {
      // Optimistically removing
      entry.count--;
      entry.hasReacted = false;
      if (entry.count <= 0) grouped.delete(emoji);
    } else if (entry) {
      // Optimistically adding
      entry.count++;
      entry.agents.push(currentProfileName ?? "You");
      entry.hasReacted = true;
    } else {
      // New emoji group
      grouped.set(emoji, { count: 1, agents: [currentProfileName ?? "You"], hasReacted: true });
    }
  }

  const handleToggle = useCallback(
    (emoji: string) => {
      if (!currentProfileId) return;

      // Optimistic: toggle immediately in local state
      setPendingToggles((prev) => {
        const next = new Set(prev);
        if (next.has(emoji)) {
          next.delete(emoji);
        } else {
          next.add(emoji);
        }
        return next;
      });

      // Fire mutation in background (no await)
      executeToggle({ messageId, profileId: currentProfileId, emoji });
      setShowPicker(false);
    },
    [currentProfileId, messageId, executeToggle],
  );

  return (
    <div className="flex items-center gap-1 mt-1 flex-wrap">
      {Array.from(grouped.entries()).map(([emoji, { count, agents, hasReacted }]) => (
        <button
          key={emoji}
          onClick={() => handleToggle(emoji)}
          title={agents.join(", ")}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors cursor-pointer ${
            hasReacted
              ? "bg-blue-50 border-blue-200 text-blue-700"
              : "bg-muted border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          <span>{EMOJI_MAP[emoji] ?? emoji}</span>
          <span>{count}</span>
        </button>
      ))}

      <Popover open={showPicker} onOpenChange={setShowPicker}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Add reaction"
            aria-label="Add reaction"
          >
            <Smile className="w-3.5 h-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-auto p-1.5 flex items-center gap-0.5">
          {EMOJI_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => handleToggle(key)}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted transition-colors cursor-pointer text-base"
              title={key}
            >
              {EMOJI_MAP[key]}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
