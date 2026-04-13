"use client";

import { useState, useMemo } from "react";
import {
  ProfileKind,
  ChannelMemberRole,
  ChannelVisibility,
  type ProfileKindValue,
} from "@/server/constants";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "urql";
import {
  LEAVE_CHANNEL,
  ADD_CHANNEL_MEMBER,
  REMOVE_CHANNEL_MEMBER,
  DELETE_CHANNEL,
} from "../../lib/graphql/mutations";
import { PROFILES_QUERY } from "../../lib/graphql/queries";
import { useProfileSidebar } from "../context/ProfileSidebarContext";
import { Button, Badge } from "../ui";
import { Hash, Lock, Loader2, LogOut, UserPlus, Users, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ProfileAvatar } from "../ui/ProfileAvatar";
import { ProfilePickerDialog } from "../ui/ProfilePickerDialog";
import type { ProfilePickerItem } from "../ui/ProfilePickerDialog";

interface Member {
  id: string;
  profileId: string;
  role: string;
  joinedAt: string;
  profile: {
    id: string;
    kind: string;
    displayName: string;
    username?: string | null;
    avatarUrl?: string | null;
    agent?: { id: string; role?: string | null } | null;
  };
}

interface ChannelInfoSidebarProps {
  channel: {
    id: string;
    name: string;
    slug: string;
    visibility: string;
    description?: string | null;
    createdByProfileId: string;
    createdByProfile: {
      id: string;
      displayName: string;
      username?: string | null;
      avatarUrl?: string | null;
    };
    members: Member[];
  };
  currentProfileId: string | undefined;
  onChannelUpdated: () => void;
  /** When true, hide the "Channel info" header (e.g. when embedded in mobile drawer). */
  hideHeader?: boolean;
}

export function ChannelInfoSidebar({
  channel,
  currentProfileId,
  onChannelUpdated,
  hideHeader = false,
}: ChannelInfoSidebarProps) {
  const router = useRouter();
  const { openProfile } = useProfileSidebar();
  const [, executeLeave] = useMutation(LEAVE_CHANNEL);
  const [, executeAddMember] = useMutation(ADD_CHANNEL_MEMBER);
  const [, executeRemoveMember] = useMutation(REMOVE_CHANNEL_MEMBER);
  const [, executeDeleteChannel] = useMutation(DELETE_CHANNEL);
  const [isLeaving, setIsLeaving] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [removingProfileId, setRemovingProfileId] = useState<string | null>(null);
  const [deleteChannelConfirm, setDeleteChannelConfirm] = useState(false);
  const [isDeletingChannel, setIsDeletingChannel] = useState(false);

  const [profilesResult] = useQuery({
    query: PROFILES_QUERY,
    variables: { limit: 200 },
    pause: !addMemberOpen,
  });
  const allProfiles = profilesResult.data?.profiles ?? [];
  const memberProfileIds = new Set(channel.members.map((m) => m.profileId));
  const profilesToAdd = allProfiles.filter((p: { id: string }) => !memberProfileIds.has(p.id));
  const addMemberItems: ProfilePickerItem[] = useMemo(
    () =>
      profilesToAdd.map(
        (p: {
          id: string;
          kind?: string;
          displayName: string;
          username?: string | null;
          agent?: { role?: string | null } | null;
        }) => ({
          id: p.id,
          name: p.displayName,
          subtitle:
            [
              p.username ? `@${p.username}` : null,
              p.kind === ProfileKind.AGENT && p.agent?.role ? p.agent.role : null,
            ]
              .filter(Boolean)
              .join(" · ") || null,
          kind: (p.kind === ProfileKind.AGENT ? ProfileKind.AGENT : ProfileKind.HUMAN) as
            | ProfileKindValue
            | undefined,
          profileId: p.id,
        }),
      ),
    [profilesToAdd],
  );

  const isMember = channel.members.some((m) => m.profileId === currentProfileId);
  const currentMembership = channel.members.find((m) => m.profileId === currentProfileId);
  const isCreator = currentMembership?.role === ChannelMemberRole.CREATOR;
  const canLeave = isMember && !isCreator;
  const isPrivate = channel.visibility === ChannelVisibility.PRIVATE;
  const isDm = channel.visibility === ChannelVisibility.DM;
  const canAddMembers = isPrivate && isCreator && !isDm;
  const canRemoveMembers = isPrivate && isCreator && !isDm;

  const handleLeave = async () => {
    if (!currentProfileId || !canLeave) return;
    setIsLeaving(true);
    try {
      await executeLeave({ channelId: channel.id, profileId: currentProfileId });
      toast.success(`Left #${channel.slug}`);
      onChannelUpdated();
      if (channel.visibility === ChannelVisibility.PRIVATE) {
        router.push("/channels");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to leave channel");
    } finally {
      setIsLeaving(false);
    }
  };

  const handleAddMember = async (profileId: string) => {
    if (!currentProfileId || !canAddMembers) return;
    try {
      await executeAddMember({
        channelId: channel.id,
        profileId,
        addedByProfileId: currentProfileId,
      });
      toast.success("Member added");
      onChannelUpdated();
      setAddMemberOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add member");
    }
  };

  const handleRemoveMember = async (profileId: string) => {
    if (!currentProfileId || !canRemoveMembers) return;
    setRemovingProfileId(profileId);
    try {
      await executeRemoveMember({
        channelId: channel.id,
        profileId,
        removedByProfileId: currentProfileId,
      });
      toast.success("Member removed");
      onChannelUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setRemovingProfileId(null);
    }
  };

  const handleDeleteChannel = async () => {
    if (!currentProfileId || !isCreator) return;
    setIsDeletingChannel(true);
    try {
      await executeDeleteChannel({ channelId: channel.id, profileId: currentProfileId });
      toast.success(`Channel #${channel.slug} deleted`);
      onChannelUpdated();
      setDeleteChannelConfirm(false);
      router.push("/channels");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete channel");
    } finally {
      setIsDeletingChannel(false);
    }
  };

  const Icon = channel.visibility === ChannelVisibility.PRIVATE ? Lock : Hash;

  return (
    <div
      className={`bg-background flex flex-col min-h-0 ${hideHeader ? "w-full border-0" : "w-64 shrink-0 border-l border-border h-full"}`}
    >
      {!hideHeader && (
        <div className="shrink-0 px-3 py-3 border-b border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Channel info
          </h3>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-foreground truncate">{channel.name}</span>
          </div>
          {!isDm && <p className="text-xs text-muted-foreground mt-0.5">#{channel.slug}</p>}
          {channel.description && (
            <p className="text-xs text-muted-foreground mt-2">{channel.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Created by {channel.createdByProfile.displayName}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-muted-foreground">
              Members ({channel.members.length})
            </h4>
            {canAddMembers && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setAddMemberOpen(true)}
                className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1 w-auto px-1.5 text-xs font-medium h-auto"
                aria-label="Add member"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add
              </Button>
            )}
          </div>
          <ul className="space-y-1.5">
            {channel.members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted group"
              >
                <button
                  type="button"
                  onClick={() => openProfile(m.profile.id)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-md -m-1 p-1 hover:bg-muted transition-colors"
                  aria-label={`View ${m.profile.displayName} profile`}
                >
                  <ProfileAvatar profileId={m.profile.id} size="sm+" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {m.profile.displayName}
                    </p>
                    {(m.profile.username || m.profile.agent?.role) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {[
                          m.profile.username ? `@${m.profile.username}` : null,
                          m.profile.agent?.role,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                </button>
                {m.role === ChannelMemberRole.CREATOR && (
                  <Badge variant="indigo" size="sm" className="shrink-0">
                    Creator
                  </Badge>
                )}
                {canRemoveMembers && m.role !== ChannelMemberRole.CREATOR && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleRemoveMember(m.profileId)}
                    disabled={removingProfileId === m.profileId}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive-muted disabled:opacity-50"
                    aria-label={`Remove ${m.profile.displayName}`}
                  >
                    {removingProfileId === m.profileId ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <X className="w-3.5 h-3.5" />
                    )}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <ProfilePickerDialog
          open={addMemberOpen}
          onOpenChange={setAddMemberOpen}
          title="Add member"
          searchPlaceholder="Search people..."
          emptyMessage="No one else to add"
          items={addMemberItems}
          loading={profilesResult.fetching}
          onSelect={(item) => handleAddMember(item.id)}
        />

        {canLeave && (
          <div className="pt-2 border-t border-border">
            <Button
              variant="secondary"
              size="sm"
              className="w-full text-muted-foreground border-border hover:bg-muted"
              onClick={handleLeave}
              disabled={isLeaving}
            >
              {isLeaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              <span className="ml-2">Leave channel</span>
            </Button>
          </div>
        )}

        {isCreator && channel.visibility !== ChannelVisibility.DM && (
          <div className="pt-2 border-t border-border">
            {!deleteChannelConfirm ? (
              <Button
                variant="secondary"
                size="sm"
                className="w-full text-destructive border-destructive/30 hover:bg-destructive-muted"
                onClick={() => setDeleteChannelConfirm(true)}
              >
                <Trash2 className="w-4 h-4" />
                <span className="ml-2">Delete channel</span>
              </Button>
            ) : (
              <div className="space-y-2 p-2 bg-muted rounded-lg border border-border">
                <p className="text-xs text-muted-foreground">
                  Permanently delete this channel and all messages? This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => setDeleteChannelConfirm(false)}
                    disabled={isDeletingChannel}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-destructive hover:bg-destructive"
                    onClick={handleDeleteChannel}
                    disabled={isDeletingChannel}
                  >
                    {isDeletingChannel ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
