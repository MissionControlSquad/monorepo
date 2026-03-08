"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { MarkdownWithMentions } from "../common/MarkdownWithMentions";
import { User } from "lucide-react";
import { useMentionData } from "../context/MentionDataContext";
import { ProfileAvatar } from "../ui/ProfileAvatar";

interface ChannelMessageContentProps {
  content: string;
}

/**
 * Channel message content with hover popovers on profile mentions.
 * Click handling for all mention types is built into MarkdownWithMentions.
 */
export function ChannelMessageContent({ content }: ChannelMessageContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { profileById } = useMentionData();
  const [popover, setPopover] = useState<{
    profileId: string;
    x: number;
    y: number;
  } | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  // Hover popover for profile mentions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const links = el.querySelectorAll<HTMLElement>(".mention-link[data-profile-id]");
    const handleMouseEnter = (e: MouseEvent) => {
      cancelHide();
      const target = e.currentTarget as HTMLElement;
      const profileId = target.getAttribute("data-profile-id");
      if (!profileId) return;
      const rect = target.getBoundingClientRect();
      setPopover({ profileId, x: rect.left, y: rect.top - 4 });
    };
    const handleMouseLeave = () => {
      hideTimeoutRef.current = setTimeout(() => setPopover(null), 120);
    };

    links.forEach((node) => {
      node.addEventListener("mouseenter", handleMouseEnter);
      node.addEventListener("mouseleave", handleMouseLeave);
    });
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      links.forEach((node) => {
        node.removeEventListener("mouseenter", handleMouseEnter);
        node.removeEventListener("mouseleave", handleMouseLeave);
      });
    };
  }, [content]);

  const profile = popover ? profileById.get(popover.profileId) : null;
  const popoverEl =
    popover &&
    profile &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="fixed z-[100] rounded-lg border border-border bg-background shadow-lg p-3 min-w-[180px] max-w-[220px]"
        style={{
          left: popover.x,
          top: popover.y,
          transform: "translateY(-100%)",
        }}
        onMouseEnter={cancelHide}
        onMouseLeave={() => {
          hideTimeoutRef.current = setTimeout(() => setPopover(null), 120);
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <ProfileAvatar profileId={String(profile.id)} size="md" />
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{profile.displayName}</p>
            {profile.username && (
              <p className="text-xs text-muted-foreground truncate">@{profile.username}</p>
            )}
          </div>
        </div>
        <Link
          href={profile.username ? `/p/${profile.username}` : `/profile/${popover.profileId}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
          onClick={(e) => e.stopPropagation()}
        >
          <User className="w-3.5 h-3.5" />
          View profile
        </Link>
      </div>,
      document.body,
    );

  return (
    <>
      <div ref={containerRef}>
        <MarkdownWithMentions content={content} />
      </div>
      {popoverEl}
    </>
  );
}
