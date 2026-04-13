"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useMutation } from "urql";
import { CHANNELS_QUERY, PROFILES_QUERY } from "../../../../lib/graphql/queries";
import { START_CONVERSATION } from "../../../../lib/graphql/mutations";
import { useAppContext, useCurrentProject } from "../../../context/AppContext";
import { useChannelsLayout } from "../../../channels/ChannelsLayoutContext";
import { Hash, Lock, Plus, FolderKanban, Search } from "lucide-react";
import { CreateChannelModal } from "../../../channels/CreateChannelModal";
import { toast } from "sonner";
import { SidebarPanelHeader } from "../SidebarPanelHeader";
import { SidebarSkeleton } from "../SidebarSkeleton";
import { SidebarEmptyState } from "../SidebarEmptyState";
import { ProfileAvatar } from "../../../ui/ProfileAvatar";
import { ProfilePickerDialog } from "../../../ui/ProfilePickerDialog";
import type { ProfilePickerItem } from "../../../ui/ProfilePickerDialog";
import { Input as ShadcnInput } from "@/components/ui/shadcn/input";
import { ProfileKind, ChannelVisibility, type ProfileKindValue } from "@/server/constants";
import { Button } from "../../../ui";
import type { Channel, ChannelMember } from "@agentcenter/types";

type ProjectFilter = "all" | "project";

export function ChannelsPanel() {
  const pathname = usePathname();
  const { currentUserProfile } = useAppContext();
  const { projectId: contextProjectId, currentProject } = useCurrentProject();
  const channelsLayout = useChannelsLayout();
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>("all");
  const createOpen = channelsLayout?.createModalOpen ?? false;
  const [search, setSearch] = useState("");
  const profileId = currentUserProfile?.id;
  const filterByProjectId =
    projectFilter === "project" && contextProjectId ? contextProjectId : undefined;

  const [result, reexecuteChannels] = useQuery({
    query: CHANNELS_QUERY,
    variables: { profileId, projectId: filterByProjectId, limit: 100 },
    requestPolicy: "cache-and-network",
  });
  const [dmsResult, reexecuteDms] = useQuery({
    query: CHANNELS_QUERY,
    variables: { profileId, visibility: ChannelVisibility.DM, limit: 100 },
    requestPolicy: "cache-and-network",
  });
  const allChannels = result.data?.channels ?? [];
  const allDms = dmsResult.data?.channels ?? [];
  const q = search.toLowerCase();
  const channels = search
    ? allChannels.filter((ch: Channel) => ch.name?.toLowerCase().includes(q))
    : allChannels;
  const dms = search
    ? allDms.filter((ch: Channel) => {
        const other = ch.members?.find((m: ChannelMember) => m.profileId !== profileId);
        const otherName = other?.profile?.displayName ?? other?.profile?.username ?? "";
        return otherName.toLowerCase().includes(q);
      })
    : allDms;
  const isFetching = result.fetching;
  const isFetchingDms = dmsResult.fetching;
  const showProjectFilter = !!contextProjectId && !!currentProject?.name;
  const [startDmOpen, setStartDmOpen] = useState(false);
  const [, executeStartConversation] = useMutation(START_CONVERSATION);
  const router = useRouter();

  const [dmProfilesResult] = useQuery({
    query: PROFILES_QUERY,
    variables: { limit: 200 },
    pause: !startDmOpen,
  });
  const dmPickerItems: ProfilePickerItem[] = (dmProfilesResult.data?.profiles ?? [])
    .filter((p: { id: string }) => p.id !== profileId)
    .map(
      (p: {
        id: string;
        kind: string;
        displayName: string;
        username?: string | null;
        agent?: { role?: string | null } | null;
      }) => ({
        id: p.id,
        name: p.displayName,
        subtitle: [
          p.username ? `@${p.username}` : null,
          p.kind === ProfileKind.AGENT && p.agent?.role ? p.agent.role : null,
        ]
          .filter(Boolean)
          .join(" · "),
        kind: (p.kind === ProfileKind.AGENT
          ? ProfileKind.AGENT
          : ProfileKind.HUMAN) as ProfileKindValue,
        profileId: p.id,
      }),
    );

  useEffect(() => {
    if (!contextProjectId && projectFilter === "project") setProjectFilter("all");
  }, [contextProjectId, projectFilter]);

  const handleChannelCreated = () => {
    reexecuteChannels({ requestPolicy: "network-only" });
  };

  const handleStartDm = async (otherProfileId: string) => {
    if (!profileId) return;
    try {
      const result = await executeStartConversation({
        myProfileId: profileId,
        otherProfileId,
      });
      const channel = result.data?.startConversation;
      if (channel?.slug) {
        setStartDmOpen(false);
        reexecuteDms({ requestPolicy: "network-only" });
        router.push(`/channels/${channel.slug}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start conversation");
    }
  };

  const channelParamFromPath = pathname?.match(/^\/channels\/([^/]+)$/)?.[1];

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 border-b border-border space-y-2 pb-3">
        <SidebarPanelHeader
          title="Channels"
          action={
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => channelsLayout?.openCreateModal()}
              className="text-muted-foreground hover:text-primary hover:bg-primary/10"
              title="Create channel"
              aria-label="Create channel"
            >
              <Plus className="w-4 h-4" />
            </Button>
          }
        />
        {showProjectFilter && (
          <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
            <button
              type="button"
              onClick={() => setProjectFilter("all")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                projectFilter === "all"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setProjectFilter("project")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors truncate ${
                projectFilter === "project"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title={currentProject?.name}
            >
              <FolderKanban className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{currentProject?.name}</span>
            </button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="flex-shrink-0 px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <ShadcnInput
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted rounded-md"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain py-1 flex flex-col gap-4">
        {/* Direct messages */}
        {profileId && (
          <div>
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Direct messages
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setStartDmOpen(true)}
                className="text-muted-foreground hover:text-primary hover:bg-primary/10"
                title="New message"
                aria-label="New message"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            {isFetchingDms && dms.length === 0 ? (
              <SidebarSkeleton count={2} height="h-9" />
            ) : dms.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">No direct messages yet</p>
            ) : (
              <ul className="space-y-0.5 px-2">
                {dms.map((ch: Channel) => {
                  const isActive =
                    channelParamFromPath === ch.slug || channelParamFromPath === ch.id;
                  const other = ch.members?.find(
                    (m: { profileId: string }) => m.profileId !== profileId,
                  );
                  const otherName =
                    other?.profile?.displayName ?? other?.profile?.username ?? "Unknown";
                  const otherRole = other?.profile?.agent?.role;
                  return (
                    <li key={ch.id}>
                      <Link
                        href={`/channels/${ch.slug}`}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                          isActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {other?.profileId ? (
                          <ProfileAvatar profileId={other.profileId} size="md" />
                        ) : (
                          <ProfileAvatar name={otherName} size="md" />
                        )}
                        <span className="truncate flex-1 min-w-0">
                          <span className="block truncate">{otherName}</span>
                          {otherRole && (
                            <span className="block text-xs text-muted-foreground font-normal truncate">
                              {otherRole}
                            </span>
                          )}
                        </span>
                        {(ch.unreadCount ?? 0) > 0 && (
                          <span className="shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center">
                            {ch.unreadCount! > 99 ? "99+" : ch.unreadCount}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Channels */}
        <div>
          <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">
            Channels
          </span>
          {isFetching && channels.length === 0 ? (
            <SidebarSkeleton count={4} height="h-8" />
          ) : channels.length === 0 ? (
            <SidebarEmptyState
              icon={<Hash />}
              message={filterByProjectId ? "No channels in this project yet" : "No channels yet"}
              action={
                <Button
                  variant="ghost"
                  onClick={() => channelsLayout?.openCreateModal()}
                  className="text-sm font-medium text-primary hover:text-primary/80 h-auto p-0"
                >
                  Create one
                </Button>
              }
            />
          ) : (
            <ul className="space-y-0.5 px-2">
              {channels.map((ch: Channel) => {
                const isActive = channelParamFromPath === ch.slug || channelParamFromPath === ch.id;
                const Icon = ch.visibility === ChannelVisibility.PRIVATE ? Lock : Hash;
                return (
                  <li key={ch.id}>
                    <Link
                      href={`/channels/${ch.slug}`}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1 min-w-0">{ch.name}</span>
                      {(ch.unreadCount ?? 0) > 0 && (
                        <span className="shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center">
                          {ch.unreadCount! > 99 ? "99+" : ch.unreadCount}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <ProfilePickerDialog
        open={startDmOpen && !!profileId}
        onOpenChange={setStartDmOpen}
        title="New message"
        searchPlaceholder="Search people..."
        emptyMessage="No one to message"
        items={dmPickerItems}
        loading={dmProfilesResult.fetching}
        onSelect={(item) => handleStartDm(item.id)}
      />

      <CreateChannelModal
        isOpen={createOpen}
        onClose={() => channelsLayout?.closeCreateModal()}
        onCreated={handleChannelCreated}
      />
    </div>
  );
}
