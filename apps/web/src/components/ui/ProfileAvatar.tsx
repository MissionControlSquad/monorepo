"use client";

import { cn } from "@/lib/utils";
import { useMentionData } from "../context/MentionDataContext";
import { getAssetUrl, generateInitials } from "@agentcenter/utils";

const SIZE_CLASSES = {
  "2xs": "w-4 h-4",
  xs: "w-5 h-5",
  sm: "w-6 h-6",
  "sm+": "w-7 h-7",
  md: "w-8 h-8",
  "md+": "w-9 h-9",
  lg: "w-10 h-10",
  xl: "w-14 h-14",
  "2xl": "w-16 h-16",
} as const;

const EMOJI_TEXT = {
  "2xs": "text-[9px]",
  xs: "text-[10px]",
  sm: "text-xs",
  "sm+": "text-sm",
  md: "text-base",
  "md+": "text-base",
  lg: "text-lg",
  xl: "text-2xl",
  "2xl": "text-3xl",
} as const;

const INITIAL_TEXT = {
  "2xs": "text-[8px]",
  xs: "text-[9px]",
  sm: "text-[10px]",
  "sm+": "text-[10px]",
  md: "text-xs",
  "md+": "text-xs",
  lg: "text-sm",
  xl: "text-lg",
  "2xl": "text-xl",
} as const;

export type ProfileAvatarSize = keyof typeof SIZE_CLASSES;

interface ProfileAvatarBaseProps {
  /** Image URL (avatarUrl or avatar field) */
  src?: string | null;
  /** Display name — first character used as fallback initial */
  name?: string | null;
  /** Emoji icon (agent identityEmoji) — shown when no image */
  emoji?: string | null;
  size?: ProfileAvatarSize;
  className?: string;
}

interface ProfileAvatarByIdProps {
  /** Profile ID — auto-resolves src/name/emoji from MentionDataContext */
  profileId: string;
  /** Agent ID — used as fallback when profileId is not provided */
  agentId?: never;
  src?: never;
  name?: never;
  emoji?: never;
  size?: ProfileAvatarSize;
  className?: string;
}

interface ProfileAvatarByAgentIdProps {
  /** Agent ID — auto-resolves src/name/emoji from MentionDataContext */
  agentId: string;
  profileId?: never;
  src?: never;
  name?: never;
  emoji?: never;
  size?: ProfileAvatarSize;
  className?: string;
}

export type ProfileAvatarProps =
  | ProfileAvatarBaseProps
  | ProfileAvatarByIdProps
  | ProfileAvatarByAgentIdProps;

/** Render an avatar circle. Priority: image → emoji → initial.
 *
 * Usage:
 * - Pass `profileId` to auto-resolve from MentionDataContext
 * - Pass `agentId` to auto-resolve from MentionDataContext
 * - Or pass `src`, `name`, `emoji` manually
 */
export function ProfileAvatar(props: ProfileAvatarProps) {
  if ("profileId" in props && props.profileId) {
    return (
      <ProfileAvatarFromContext
        lookupId={props.profileId}
        lookupType="profile"
        size={props.size}
        className={props.className}
      />
    );
  }
  if ("agentId" in props && props.agentId) {
    return (
      <ProfileAvatarFromContext
        lookupId={props.agentId}
        lookupType="agent"
        size={props.size}
        className={props.className}
      />
    );
  }
  return (
    <ProfileAvatarCore
      src={props.src}
      name={props.name}
      emoji={props.emoji}
      size={props.size}
      className={props.className}
    />
  );
}

function ProfileAvatarFromContext({
  lookupId,
  lookupType,
  size,
  className,
}: {
  lookupId: string;
  lookupType: "profile" | "agent";
  size?: ProfileAvatarSize;
  className?: string;
}) {
  const { profileById, agentById } = useMentionData();

  let src: string | null = null;
  let emoji: string | null = null;
  let name: string | null = null;

  if (lookupType === "profile") {
    const profile = profileById.get(lookupId);
    if (profile) {
      src = getAssetUrl(profile.avatarUrl as string | undefined, { public: true });
      emoji =
        (profile.agent as { identityEmoji?: string | null } | undefined)?.identityEmoji ?? null;
      name = profile.displayName ?? null;
    }
  } else {
    const agent = agentById.get(lookupId);
    if (agent) {
      src = getAssetUrl(agent.avatar as string | undefined);
      emoji = (agent.identityEmoji as string | undefined) ?? null;
      name = agent.name ?? null;
    }
  }

  return (
    <ProfileAvatarCore src={src} emoji={emoji} name={name} size={size} className={className} />
  );
}

function ProfileAvatarCore({ src, name, emoji, size = "md", className }: ProfileAvatarBaseProps) {
  const dim = SIZE_CLASSES[size];

  if (src) {
    return (
      <img
        src={src}
        alt={name ?? ""}
        className={cn(dim, "rounded-full object-cover shrink-0", className)}
      />
    );
  }

  if (emoji) {
    return (
      <div
        className={cn(
          dim,
          "rounded-full flex items-center justify-center bg-primary/10 shrink-0",
          EMOJI_TEXT[size],
          className,
        )}
      >
        {emoji}
      </div>
    );
  }

  return (
    <div
      className={cn(
        dim,
        "rounded-full flex items-center justify-center text-primary-foreground font-bold bg-primary shrink-0",
        INITIAL_TEXT[size],
        className,
      )}
    >
      {generateInitials(name ?? "")}
    </div>
  );
}
