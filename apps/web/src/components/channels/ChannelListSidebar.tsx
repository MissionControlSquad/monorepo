"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useMutation } from "urql";
import { CHANNELS_QUERY, PROFILES_QUERY } from "../../lib/graphql/queries";
import { START_CONVERSATION } from "../../lib/graphql/mutations";
import { useAppContext, useCurrentProject } from "../context/AppContext";
import { useChannelsLayout } from "./ChannelsLayoutContext";
import { ProfileAvatar } from "../ui/ProfileAvatar";
import { Hash, Lock, Plus, MessageSquare, FolderKanban } from "lucide-react";
import { CreateChannelModal } from "@/components/channels/CreateChannelModal";
import { ChannelVisibility } from "@/server/constants";
import { toast } from "sonner";
import { Button, SkeletonList } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/shadcn/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import type { Channel } from "@agentcenter/types";

type ProjectFilter = "all" | "project";

function StartDmModal({
  open,
  onOpenChange,
  profileId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  onSelect: (otherProfileId: string) => void;
}) {
  const [profilesResult] = useQuery({
    query: PROFILES_QUERY,
    variables: { limit: 200 },
    pause: !open,
  });
  const profiles = (profilesResult.data?.profiles ?? []).filter(
    (p: { id: string }) => p.id !== profileId,
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 gap-0 max-h-[70vh] flex flex-col">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="text-base">New message</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-2">
          {profilesResult.fetching ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
            </div>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No one to message</p>
          ) : (
            <ul className="space-y-0.5">
              {profiles.map(
                (p: {
                  id: string;
                  displayName: string;
                  username?: string | null;
                  avatarUrl?: string | null;
                }) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(p.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm hover:bg-muted transition-colors"
                    >
                      <ProfileAvatar profileId={p.id} size="md+" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">{p.displayName}</p>
                        {p.username && (
                          <p className="text-xs text-muted-foreground truncate">@{p.username}</p>
                        )}
                      </div>
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ChannelListSidebar() {
  const pathname = usePathname();
  const { currentUserProfile } = useAppContext();
  const { projectId: contextProjectId, currentProject } = useCurrentProject();
  const channelsLayout = useChannelsLayout();
  const createOpen = channelsLayout?.createModalOpen ?? false;
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>("all");
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
  const channels = result.data?.channels ?? [];
  const dms = dmsResult.data?.channels ?? [];
  const isFetching = result.fetching;
  const isFetchingDms = dmsResult.fetching;
  const showProjectFilter = !!contextProjectId && !!currentProject?.name;
  const [startDmOpen, setStartDmOpen] = useState(false);
  const [, executeStartConversation] = useMutation(START_CONVERSATION);
  const router = useRouter();

  useEffect(() => {
    if (!contextProjectId && projectFilter === "project") setProjectFilter("all");
  }, [contextProjectId, projectFilter]);

  const refetchChannelList = useCallback(() => {
    reexecuteChannels({ requestPolicy: "network-only" });
    reexecuteDms({ requestPolicy: "network-only" });
  }, [reexecuteChannels, reexecuteDms]);
  useEffect(() => {
    channelsLayout?.setRefetchChannelList?.(refetchChannelList);
    return () => channelsLayout?.setRefetchChannelList?.(null);
  }, [channelsLayout?.setRefetchChannelList, refetchChannelList]);

  const handleChannelCreated = () => {
    reexecuteChannels({ requestPolicy: "network-only" });
  };

  const isDrawer = !!channelsLayout;
  const open = channelsLayout?.channelListOpen ?? false;
  const closeList = channelsLayout?.closeChannelList;

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
        if (isDrawer) closeList?.();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start conversation");
    }
  };

  const channelParamFromPath = pathname?.match(/^\/channels\/([^/]+)$/)?.[1];

  const sidebarContent = (
    <>
      <div className="flex-shrink-0 px-3 py-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
            Channels
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => channelsLayout?.openCreateModal()}
              title="Create channel"
              aria-label="Create channel"
              className="text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
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
                title="New message"
                aria-label="New message"
                className="text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            {isFetchingDms && dms.length === 0 ? (
              <div className="px-2">
                <SkeletonList count={2} height="h-9" />
              </div>
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
                  const otherAvatar = other?.profile?.avatarUrl;
                  return (
                    <li key={ch.id}>
                      <Link
                        href={`/channels/${ch.slug}`}
                        onClick={isDrawer ? closeList : undefined}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                          isActive
                            ? "bg-indigo-50 text-indigo-800 font-medium"
                            : "text-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <ProfileAvatar src={otherAvatar} name={otherName} size="md" />
                        <span className="truncate flex-1 min-w-0">{otherName}</span>
                        {(ch.unreadCount ?? 0) > 0 && (
                          <span className="shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-indigo-600 text-white text-xs font-medium flex items-center justify-center">
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
            <div className="px-3 py-4">
              <SkeletonList count={4} height="h-8" />
            </div>
          ) : channels.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-sm text-muted-foreground">
                {filterByProjectId ? "No channels in this project yet" : "No channels yet"}
              </p>
              <Button
                variant="link"
                onClick={() => channelsLayout?.openCreateModal()}
                className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 h-auto p-0"
              >
                Create one
              </Button>
            </div>
          ) : (
            <ul className="space-y-0.5 px-2">
              {channels.map((ch: Channel) => {
                const isActive = channelParamFromPath === ch.slug || channelParamFromPath === ch.id;
                const Icon = ch.visibility === ChannelVisibility.PRIVATE ? Lock : Hash;
                return (
                  <li key={ch.id}>
                    <Link
                      href={`/channels/${ch.slug}`}
                      onClick={isDrawer ? closeList : undefined}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? "bg-indigo-50 text-indigo-800 font-medium"
                          : "text-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1 min-w-0">{ch.name}</span>
                      {(ch.unreadCount ?? 0) > 0 && (
                        <span className="shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-indigo-600 text-white text-xs font-medium flex items-center justify-center">
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
    </>
  );

  return (
    <>
      {/* Desktop: static sidebar */}
      {!isDrawer && (
        <div className="h-full flex flex-col w-60 shrink-0 border-r border-border bg-background">
          {sidebarContent}
        </div>
      )}

      {/* Mobile: Sheet drawer */}
      {isDrawer && (
        <Sheet
          open={open}
          onOpenChange={(v) => {
            if (!v) closeList?.();
          }}
        >
          <SheetContent side="left" className="w-60 max-w-[85vw] p-0 gap-0 flex flex-col">
            <SheetHeader className="px-3 py-3 border-b border-border sr-only">
              <SheetTitle>Channels</SheetTitle>
            </SheetHeader>
            {sidebarContent}
          </SheetContent>
        </Sheet>
      )}

      {profileId && (
        <StartDmModal
          open={startDmOpen}
          onOpenChange={setStartDmOpen}
          profileId={profileId}
          onSelect={handleStartDm}
        />
      )}

      <CreateChannelModal
        isOpen={createOpen}
        onClose={() => channelsLayout?.closeCreateModal()}
        onCreated={handleChannelCreated}
      />
    </>
  );
}
